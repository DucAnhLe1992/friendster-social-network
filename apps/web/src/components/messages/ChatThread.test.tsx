// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getMessages = vi.fn();
const sendMessage = vi.fn();
vi.mock('@/lib/api', () => ({
  apiClient: {
    getConversation: async () => ({ _id: 'c1', participant: { _id: 'u2', handle: 'bob', displayName: 'Bob' } }),
    getMessages: (...args: unknown[]) => getMessages(...args),
    sendMessage: (...args: unknown[]) => sendMessage(...args),
    markConversationRead: async () => undefined,
  },
  mediaUrl: () => undefined,
  isStaleSessionError: () => false,
}));

const { LiveBuffer, applyLiveMessage } = await import('@/lib/messageSync');
const liveBuffer = new LiveBuffer();
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ socket: null, synced: false, liveBuffer }) }));

const { default: ChatThread } = await import('@/components/messages/ChatThread');
const { useAuthStore } = await import('@/store/authStore');

const msg = (id: string, at: number, sender = 'u1'): Message => ({
  _id: id,
  conversation: 'c1',
  sender,
  content: `text-${id}`,
  isRead: false,
  createdAt: new Date(at).toISOString(),
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const page = (messages: Message[]) => ({ messages, meta: { hasMore: false } });

let qc: QueryClient;
let root: Root;
let container: HTMLDivElement;

const mount = async () => {
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ChatThread conversationId="c1" />
        </QueryClientProvider>
      </MemoryRouter>
    );
  });
};

const textarea = () => container.querySelector('textarea')!;

const type = async (text: string) => {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(textarea(), text);
    textarea().dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const clickSend = async () => {
  await act(async () => container.querySelector('form')!.requestSubmit());
};

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

const ids = () => qc.getQueryData<Message[]>(['messages', 'c1'])?.map((m) => m._id);

describe('ChatThread sending', () => {
  beforeEach(() => {
    getMessages.mockReset();
    sendMessage.mockReset();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useAuthStore.setState({ user: { _id: 'u1' } as never });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('keeps a sent message when the first load finishes afterwards with an older, empty list', async () => {
    const snapshot = deferred<ReturnType<typeof page>>();
    getMessages.mockReturnValueOnce(snapshot.promise);
    sendMessage.mockResolvedValueOnce(msg('sent', 5));
    await mount();

    await type('hello');
    await clickSend();
    await act(async () => snapshot.resolve(page([])));
    await flush();

    expect(ids()).toEqual(['sent']);
    expect(container.textContent).toContain('text-sent');
  });

  it('keeps existing and sent messages when a background refresh finishes afterwards', async () => {
    getMessages.mockResolvedValueOnce(page([msg('A', 1)]));
    await mount();
    await flush();
    expect(ids()).toEqual(['A']);

    const snapshot = deferred<ReturnType<typeof page>>();
    getMessages.mockReturnValueOnce(snapshot.promise);
    const refresh = qc.refetchQueries({ queryKey: ['messages', 'c1'] });
    sendMessage.mockResolvedValueOnce(msg('B', 2));
    await type('hello');
    await clickSend();
    await act(async () => {
      snapshot.resolve(page([msg('A', 1)]));
      await refresh;
    });

    expect(ids()).toEqual(['A', 'B']);
  });

  it('shows a message once when the live echo arrives before the send confirmation', async () => {
    getMessages.mockResolvedValueOnce(page([]));
    await mount();
    await flush();

    const ack = deferred<Message>();
    sendMessage.mockReturnValueOnce(ack.promise);
    await type('hello');
    await clickSend();
    await act(async () => applyLiveMessage(qc, liveBuffer, 'c1', msg('M', 5)));
    await act(async () => ack.resolve(msg('M', 5)));

    expect(ids()).toEqual(['M']);
    expect(container.textContent?.match(/text-M/g)).toHaveLength(1);
  });

  it('keeps a new draft typed while the previous message is still sending', async () => {
    getMessages.mockResolvedValueOnce(page([]));
    await mount();
    await flush();

    const ack = deferred<Message>();
    sendMessage.mockReturnValueOnce(ack.promise);
    await type('first');
    await clickSend();
    await type('second');
    await act(async () => ack.resolve(msg('M', 5)));

    expect(textarea().value).toBe('second');
  });
});
