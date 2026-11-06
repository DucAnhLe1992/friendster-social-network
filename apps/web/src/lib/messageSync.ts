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

/** Applies a live message; a thread still loading is refetched, since its in-flight response may predate the message. */
export const applyLiveMessage = (queryClient: QueryClient, conversationId: string, message: Message) => {
  const key = ['messages', conversationId];
  const state = queryClient.getQueryState<Message[]>(key);
  if (state && state.data === undefined && state.fetchStatus === 'fetching') {
    queryClient.invalidateQueries({ queryKey: key, exact: true });
    return;
  }
  queryClient.setQueryData<Message[]>(key, (old) => mergeMessages(old, [message]));
};

/** `null` means the thread had no messages (or was still loading) and must be reloaded rather than paged forward. */
export type SyncCursors = Map<string, string | null>;

/** UUID v4 that also works outside secure contexts, where `crypto.randomUUID` is unavailable. */
export const newClientId = (): string => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

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

const reload = (queryClient: QueryClient, conversationId: string) =>
  queryClient.resetQueries({ queryKey: ['messages', conversationId], exact: true }).catch(() => undefined);

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

/** Fills every loaded thread from where it left off, so nothing sent while offline or before connecting is skipped. */
export const catchUp = async (queryClient: QueryClient, cursors: SyncCursors) => {
  await Promise.all(
    [...cursors].map(([conversationId, cursor]) =>
      cursor
        ? fillGap(queryClient, conversationId, cursor).catch(() =>
            // Falling back to the newest page keeps the thread gap-free; older history stays reachable by scrolling.
            reload(queryClient, conversationId)
          )
        : reload(queryClient, conversationId)
    )
  );
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
  queryClient.invalidateQueries({ queryKey: ['conversation'] });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  queryClient.invalidateQueries({ queryKey: ['unread'] });
};
