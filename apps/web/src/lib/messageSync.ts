import axios from 'axios';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient, isStaleSessionError } from '@/lib/api';
import type { Message } from '@/types';

const MAX_CATCH_UP_PAGES = 20;

const compare = (a: Message, b: Message) => {
  const byTime = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return byTime !== 0 ? byTime : a._id.localeCompare(b._id);
};

export const mergeMessages = (old: Message[] | undefined, incoming: Message[]): Message[] | undefined => {
  if (!old) return old;
  const known = new Set(old.map((m) => m._id));
  const fresh = incoming.filter((m) => !known.has(m._id) && (known.add(m._id), true));
  return fresh.length ? [...old, ...fresh].sort(compare) : old;
};

/**
 * Holds messages that reach a thread from outside its snapshot (live socket events and catch-up pages) while that
 * snapshot is being fetched. A snapshot replaces the cached list wholesale and may have been read before those
 * messages existed, so they are merged back into its result.
 */
export class LiveBuffer {
  private seq = 0;
  private readonly entries = new Map<string, { seq: number; message: Message }[]>();
  private readonly inFlight = new Map<string, number[]>();

  record(conversationId: string, messages: Message[]) {
    if (!this.inFlight.get(conversationId)?.length) return;
    const list = this.entries.get(conversationId) ?? [];
    for (const message of messages) list.push({ seq: ++this.seq, message });
    this.entries.set(conversationId, list);
  }

  async snapshot(conversationId: string, load: () => Promise<Message[]>): Promise<Message[]> {
    const mark = this.seq;
    const marks = this.inFlight.get(conversationId) ?? [];
    marks.push(mark);
    this.inFlight.set(conversationId, marks);
    try {
      const messages = await load();
      const live = (this.entries.get(conversationId) ?? []).filter((e) => e.seq > mark).map((e) => e.message);
      return mergeMessages(messages, live) ?? messages;
    } finally {
      this.release(conversationId, mark);
    }
  }

  private release(conversationId: string, mark: number) {
    const marks = this.inFlight.get(conversationId) ?? [];
    marks.splice(marks.indexOf(mark), 1);
    if (!marks.length) {
      this.inFlight.delete(conversationId);
      this.entries.delete(conversationId);
      return;
    }
    const oldest = Math.min(...marks);
    this.entries.set(conversationId, (this.entries.get(conversationId) ?? []).filter((e) => e.seq > oldest));
  }
}

/** Every message that reaches a thread outside its own snapshot must enter the cache through here. */
const applyMessages = (queryClient: QueryClient, buffer: LiveBuffer, conversationId: string, messages: Message[]) => {
  buffer.record(conversationId, messages);
  queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => mergeMessages(old, messages));
};

export const applyLiveMessage = (
  queryClient: QueryClient,
  buffer: LiveBuffer,
  conversationId: string,
  message: Message
) => applyMessages(queryClient, buffer, conversationId, [message]);

/** `null` means the thread had no messages (or was still loading) and must be reloaded rather than paged forward. */
export type SyncCursors = Map<string, string | null>;

/** Where every loaded (or loading) thread currently ends, including empty ones. */
export const snapshotCursors = (queryClient: QueryClient): SyncCursors => {
  const cursors: SyncCursors = new Map();
  for (const [key, data] of queryClient.getQueriesData<Message[]>({ queryKey: ['messages'] })) {
    if (typeof key[1] !== 'string') continue;
    cursors.set(key[1], data?.[data.length - 1]?._id ?? null);
  }
  return cursors;
};

/** Cursors recorded at the start of an outage win over current ones, which may already include later live messages. */
export const mergeCursors = (current: SyncCursors, earliest: SyncCursors | undefined): SyncCursors =>
  new Map([...current, ...(earliest ?? [])]);

/** Thrown when the session that started a catch-up has ended; such work must not touch the cache again. */
export class SyncCancelledError extends Error {
  constructor() {
    super('Catch-up was cancelled');
  }
}

const ensureLive = (signal: AbortSignal) => {
  if (signal.aborted) throw new SyncCancelledError();
};

/** A thread the server refuses outright (gone, forbidden) will not recover by retrying; it shows its own error. */
const isRetryable = (error: unknown) => {
  if (error instanceof SyncCancelledError || isStaleSessionError(error)) return false;
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status === undefined || status >= 500 || status === 408 || status === 429;
};

interface SyncContext {
  queryClient: QueryClient;
  buffer: LiveBuffer;
  signal: AbortSignal;
}

const reload = ({ queryClient, signal }: SyncContext, conversationId: string) => {
  ensureLive(signal);
  return queryClient.resetQueries({ queryKey: ['messages', conversationId], exact: true }, { throwOnError: true });
};

const fillGap = async (ctx: SyncContext, conversationId: string, cursor: string) => {
  let after = cursor;
  for (let page = 0; page < MAX_CATCH_UP_PAGES; page++) {
    ensureLive(ctx.signal);
    const res = await apiClient.getMessages(conversationId, { after }, ctx.signal);
    ensureLive(ctx.signal);
    applyMessages(ctx.queryClient, ctx.buffer, conversationId, res.messages);
    const last = res.messages[res.messages.length - 1];
    if (!res.meta.hasMore || !last) return;
    after = last._id;
  }
  throw new Error('Gap too large');
};

const syncThread = async (ctx: SyncContext, conversationId: string, cursor: string | null) => {
  const loaded = ctx.queryClient.getQueryData(['messages', conversationId]) !== undefined;
  if (cursor && loaded) {
    try {
      await fillGap(ctx, conversationId, cursor);
      return;
    } catch (error) {
      if (error instanceof SyncCancelledError) throw error;
      // Falling back to the newest page keeps the thread gap-free; older history stays reachable by scrolling.
    }
  }
  await reload(ctx, conversationId);
};

/**
 * Fills every thread from where it left off. Resolves with the cursors of threads that could not be reconciled,
 * so the caller can keep them and retry; an empty result means everything is in sync.
 *
 * A thread that is on screen is reconciled with the server. A loaded thread that is not on screen is only reset:
 * its stale copy is dropped and it loads fresh when opened again, so no request is made for it now.
 *
 * Once `signal` aborts (the session ended), no further cache writes, resets or invalidations happen and the
 * promise rejects with `SyncCancelledError`.
 */
export const catchUp = async (
  queryClient: QueryClient,
  buffer: LiveBuffer,
  cursors: SyncCursors,
  signal: AbortSignal
): Promise<SyncCursors> => {
  const ctx = { queryClient, buffer, signal };
  const failed: SyncCursors = new Map();
  await Promise.all(
    [...cursors].map(([conversationId, cursor]) =>
      syncThread(ctx, conversationId, cursor).catch((error) => {
        if (isRetryable(error)) failed.set(conversationId, cursor);
      })
    )
  );
  ensureLive(signal);
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
  queryClient.invalidateQueries({ queryKey: ['conversation'] });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  queryClient.invalidateQueries({ queryKey: ['unread'] });
  return failed;
};
