import axios from 'axios';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { Message } from '@/types';

const MAX_CATCH_UP_PAGES = 20;

const compare = (a: Message, b: Message) => {
  const byTime = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return byTime !== 0 ? byTime : a._id.localeCompare(b._id);
};

export const mergeMessages = (old: Message[] | undefined, incoming: Message[]): Message[] | undefined => {
  if (!old) return old;
  const known = new Set(old.map((m) => m._id));
  const fresh = incoming.filter((m) => !known.has(m._id));
  return fresh.length ? [...old, ...fresh].sort(compare) : old;
};

/**
 * Holds live messages that arrive while a thread snapshot is being fetched. A snapshot replaces the cached list
 * wholesale and may have been read before those messages existed, so they are merged back into its result.
 */
export class LiveBuffer {
  private seq = 0;
  private readonly entries = new Map<string, { seq: number; message: Message }[]>();
  private readonly inFlight = new Map<string, number[]>();

  record(conversationId: string, message: Message) {
    if (!this.inFlight.get(conversationId)?.length) return;
    const list = this.entries.get(conversationId) ?? [];
    list.push({ seq: ++this.seq, message });
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

export const applyLiveMessage = (
  queryClient: QueryClient,
  buffer: LiveBuffer,
  conversationId: string,
  message: Message
) => {
  buffer.record(conversationId, message);
  queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => mergeMessages(old, [message]));
};

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

/** A thread the server refuses outright (gone, forbidden) will not recover by retrying; it shows its own error. */
const isRetryable = (error: unknown) => {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status === undefined || status >= 500 || status === 408 || status === 429;
};

const reload = (queryClient: QueryClient, conversationId: string) =>
  queryClient.resetQueries({ queryKey: ['messages', conversationId], exact: true }, { throwOnError: true });

const fillGap = async (queryClient: QueryClient, conversationId: string, cursor: string) => {
  let after = cursor;
  for (let page = 0; page < MAX_CATCH_UP_PAGES; page++) {
    const res = await apiClient.getMessages(conversationId, { after });
    queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => mergeMessages(old, res.messages));
    const last = res.messages[res.messages.length - 1];
    if (!res.meta.hasMore || !last) return;
    after = last._id;
  }
  throw new Error('Gap too large');
};

const syncThread = async (queryClient: QueryClient, conversationId: string, cursor: string | null) => {
  const loaded = queryClient.getQueryData(['messages', conversationId]) !== undefined;
  if (cursor && loaded) {
    try {
      await fillGap(queryClient, conversationId, cursor);
      return;
    } catch {
      // Falling back to the newest page keeps the thread gap-free; older history stays reachable by scrolling.
    }
  }
  await reload(queryClient, conversationId);
};

/**
 * Fills every thread from where it left off. Resolves with the cursors of threads that could not be reconciled,
 * so the caller can keep them and retry; an empty result means everything is in sync.
 */
export const catchUp = async (queryClient: QueryClient, cursors: SyncCursors): Promise<SyncCursors> => {
  const failed: SyncCursors = new Map();
  await Promise.all(
    [...cursors].map(([conversationId, cursor]) =>
      syncThread(queryClient, conversationId, cursor).catch((error) => {
        if (isRetryable(error)) failed.set(conversationId, cursor);
      })
    )
  );
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
  queryClient.invalidateQueries({ queryKey: ['conversation'] });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  queryClient.invalidateQueries({ queryKey: ['unread'] });
  return failed;
};
