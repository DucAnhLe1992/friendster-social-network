import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types';

const getMessages = vi.fn();
vi.mock('@/lib/api', () => ({ apiClient: { getMessages: (...args: unknown[]) => getMessages(...args) } }));

const { catchUp, mergeCursors, mergeMessages, newClientId, snapshotCursors } = await import('@/lib/messageSync');

const msg = (id: string, at: number): Message => ({
  _id: id,
  conversation: 'c1',
  sender: 'u1',
  content: id,
  isRead: false,
  createdAt: new Date(at).toISOString(),
});

const page = (messages: Message[], hasMore = false) => ({ messages, meta: { hasMore } });

describe('mergeMessages', () => {
  it('drops duplicates and orders by time, then by id', () => {
    const merged = mergeMessages([msg('b', 1), msg('d', 3)], [msg('d', 3), msg('a', 1), msg('c', 2)]);
    expect(merged?.map((m) => m._id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves an unloaded thread alone so it loads fresh', () => {
    expect(mergeMessages(undefined, [msg('a', 1)])).toBeUndefined();
  });
});

describe('cursors', () => {
  it('records empty threads so they are reloaded after reconnecting', () => {
    const qc = new QueryClient();
    qc.setQueryData(['messages', 'full'], [msg('a', 1), msg('b', 2)]);
    qc.setQueryData(['messages', 'empty'], []);
    expect(snapshotCursors(qc)).toEqual(new Map([['full', 'b'], ['empty', null]]));
  });

  it('keeps the position from the start of an outage', () => {
    const merged = mergeCursors(new Map([['c1', 'late'], ['c2', 'x']]), new Map([['c1', 'early']]));
    expect(merged).toEqual(new Map([['c1', 'early'], ['c2', 'x']]));
  });
});

describe('catchUp', () => {
  beforeEach(() => {
    getMessages.mockReset();
  });

  it('pages forward through everything missed', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['messages', 'c1'], [msg('a', 1)]);
    getMessages
      .mockResolvedValueOnce(page([msg('b', 2)], true))
      .mockResolvedValueOnce(page([msg('c', 3)]));

    await catchUp(qc, new Map([['c1', 'a']]));

    expect(getMessages).toHaveBeenNthCalledWith(1, 'c1', { after: 'a' });
    expect(getMessages).toHaveBeenNthCalledWith(2, 'c1', { after: 'b' });
    expect(qc.getQueryData<Message[]>(['messages', 'c1'])?.map((m) => m._id)).toEqual(['a', 'b', 'c']);
  });

  it('reloads a thread that was empty instead of paging from nowhere', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['messages', 'c1'], []);

    await catchUp(qc, new Map([['c1', null]]));

    expect(getMessages).not.toHaveBeenCalled();
    expect(qc.getQueryState(['messages', 'c1'])?.data).toBeUndefined();
  });

  it('still finishes when the server cannot be reached', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['messages', 'c1'], [msg('a', 1)]);
    getMessages.mockImplementation(async () => {
      throw new Error('offline');
    });
    await expect(catchUp(qc, new Map([['c1', 'a']]))).resolves.toBeUndefined();
  });
});

describe('newClientId', () => {
  it('produces distinct version 4 UUIDs', () => {
    const a = newClientId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientId()).not.toBe(a);
  });
});
