import { AxiosError, type AxiosResponse } from 'axios';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types';

const getMessages = vi.fn();
vi.mock('@/lib/api', () => ({ apiClient: { getMessages: (...args: unknown[]) => getMessages(...args) } }));

const { applyLiveMessage, catchUp, LiveBuffer, mergeCursors, mergeMessages, snapshotCursors } =
  await import('@/lib/messageSync');
const { newClientId } = await import('@/lib/utils');

const msg = (id: string, at: number): Message => ({
  _id: id,
  conversation: 'c1',
  sender: 'u1',
  content: id,
  isRead: false,
  createdAt: new Date(at).toISOString(),
});

const page = (messages: Message[], hasMore = false) => ({ messages, meta: { hasMore } });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Mounts a thread the way the chat screen does: an active observer whose loads go through the live buffer. */
const mountThread = (qc: QueryClient, buffer: InstanceType<typeof LiveBuffer>, load: () => Promise<Message[]>) => {
  const observer = new QueryObserver<Message[]>(qc, {
    queryKey: ['messages', 'c1'],
    queryFn: () => buffer.snapshot('c1', load),
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  return { observer, unsubscribe };
};

const ids = (qc: QueryClient) => qc.getQueryData<Message[]>(['messages', 'c1'])?.map((m) => m._id);

describe('mergeMessages', () => {
  it('drops duplicates and orders by time, then by id', () => {
    const merged = mergeMessages([msg('b', 1), msg('d', 3)], [msg('d', 3), msg('a', 1), msg('c', 2)]);
    expect(merged?.map((m) => m._id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves an unloaded thread alone so it loads fresh', () => {
    expect(mergeMessages(undefined, [msg('a', 1)])).toBeUndefined();
  });
});

describe('live messages during a load', () => {
  it('keeps a message that arrives while the first load is still running', async () => {
    const qc = client();
    const buffer = new LiveBuffer();
    const response = deferred<Message[]>();
    const { unsubscribe } = mountThread(qc, buffer, () => response.promise);

    applyLiveMessage(qc, buffer, 'c1', msg('live', 5));
    response.resolve([]);
    await vi.waitFor(() => expect(ids(qc)).toEqual(['live']));
    unsubscribe();
  });

  it('keeps a message that arrives while a refresh is replacing the list', async () => {
    const qc = client();
    const buffer = new LiveBuffer();
    qc.setQueryData(['messages', 'c1'], [msg('old', 1)]);
    const response = deferred<Message[]>();
    const { observer, unsubscribe } = mountThread(qc, buffer, () => response.promise);

    const refetch = observer.refetch();
    applyLiveMessage(qc, buffer, 'c1', msg('live', 5));
    response.resolve([msg('old', 1)]);
    await refetch;

    expect(ids(qc)).toEqual(['old', 'live']);
    unsubscribe();
  });

  it('does not hold on to messages once no load is running', async () => {
    const qc = client();
    const buffer = new LiveBuffer();
    applyLiveMessage(qc, buffer, 'c1', msg('early', 1));
    const { unsubscribe } = mountThread(qc, buffer, async () => [msg('newest', 9)]);
    await vi.waitFor(() => expect(ids(qc)).toEqual(['newest']));
    unsubscribe();
  });
});

describe('cursors', () => {
  it('records empty threads so they are reloaded after reconnecting', () => {
    const qc = client();
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
    const qc = client();
    qc.setQueryData(['messages', 'c1'], [msg('a', 1)]);
    getMessages
      .mockResolvedValueOnce(page([msg('b', 2)], true))
      .mockResolvedValueOnce(page([msg('c', 3)]));

    const failed = await catchUp(qc, new Map([['c1', 'a']]));

    expect(failed.size).toBe(0);
    expect(getMessages).toHaveBeenNthCalledWith(1, 'c1', { after: 'a' });
    expect(getMessages).toHaveBeenNthCalledWith(2, 'c1', { after: 'b' });
    expect(ids(qc)).toEqual(['a', 'b', 'c']);
  });

  it('reloads an open thread that was empty', async () => {
    const qc = client();
    const buffer = new LiveBuffer();
    let calls = 0;
    const { unsubscribe } = mountThread(qc, buffer, async () => (calls++ === 0 ? [] : [msg('first', 5)]));
    await vi.waitFor(() => expect(ids(qc)).toEqual([]));

    const failed = await catchUp(qc, new Map([['c1', null]]));

    expect(failed.size).toBe(0);
    expect(getMessages).not.toHaveBeenCalled();
    expect(ids(qc)).toEqual(['first']);
    unsubscribe();
  });

  it('reports a thread it could not reconcile and keeps its earliest position', async () => {
    const qc = client();
    const offline = async (): Promise<never> => {
      throw new Error('offline');
    };
    qc.setQueryData(['messages', 'c1'], [msg('a', 1)]);
    const { unsubscribe } = mountThread(qc, new LiveBuffer(), offline);
    getMessages.mockImplementation(offline);

    const failed = await catchUp(qc, new Map([['c1', 'a']]));

    expect(failed).toEqual(new Map([['c1', 'a']]));
    unsubscribe();
  });

  it('does not keep retrying a thread the server refuses', async () => {
    const qc = client();
    const gone = async (): Promise<never> => {
      throw new AxiosError('Not found', 'ERR_BAD_REQUEST', undefined, undefined, { status: 404 } as AxiosResponse);
    };
    qc.setQueryData(['messages', 'c1'], [msg('a', 1)]);
    const { unsubscribe } = mountThread(qc, new LiveBuffer(), gone);
    getMessages.mockImplementation(gone);

    expect((await catchUp(qc, new Map([['c1', 'a']]))).size).toBe(0);
    unsubscribe();
  });
});

describe('newClientId', () => {
  it('produces distinct version 4 UUIDs', () => {
    const a = newClientId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientId()).not.toBe(a);
  });
});
