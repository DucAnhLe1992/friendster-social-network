// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, Tokens, User } from '@/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeSocket {
  connected = false;
  private readonly handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  connect() {}
  disconnect() {
    this.connected = false;
  }
  fire(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true;
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

const sockets: FakeSocket[] = [];
vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
}));

const getMessages = vi.fn();
vi.mock('@/lib/api', () => ({
  SERVER_ORIGIN: 'http://test',
  apiClient: {
    getMessages: (...args: unknown[]) => getMessages(...args),
    getUnreadNotifications: async () => ({}),
  },
  isStaleSessionError: () => false,
}));

const { RealtimeProvider, useRealtime } = await import('@/context/RealtimeContext');
const { useAuthStore } = await import('@/store/authStore');

const msg = (id: string, at: number): Message => ({
  _id: id,
  conversation: 'c1',
  sender: 'u1',
  content: id,
  isRead: false,
  createdAt: new Date(at).toISOString(),
});

const user = (id: string) => ({ _id: id, handle: id, displayName: id }) as User;
const tokens = (id: string): Tokens => ({ accessToken: `access-${id}`, refreshToken: `refresh-${id}` });

let synced = false;
const recordSynced = (value: boolean) => {
  synced = value;
};
const SyncProbe = ({ onChange }: { onChange: (value: boolean) => void }) => {
  const { synced: value } = useRealtime();
  useEffect(() => onChange(value), [value, onChange]);
  return null;
};

let root: Root;
let qc: QueryClient;

const mount = async () => {
  const container = document.createElement('div');
  root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <RealtimeProvider>
          <SyncProbe onChange={recordSynced} />
        </RealtimeProvider>
      </QueryClientProvider>
    );
  });
};

const observe = (load: () => Promise<Message[]>) => {
  const observer = new QueryObserver<Message[]>(qc, { queryKey: ['messages', 'c1'], queryFn: load, staleTime: Infinity });
  return observer.subscribe(() => undefined);
};

const ids = () => qc.getQueryData<Message[]>(['messages', 'c1'])?.map((m) => m._id);

describe('RealtimeProvider recovery', () => {
  beforeEach(() => {
    sockets.length = 0;
    synced = false;
    getMessages.mockReset();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useAuthStore.getState().login(user('first'), tokens('first'));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    useAuthStore.getState().logout();
  });

  it('stays unsynced after a failed catch-up and retries until it succeeds', async () => {
    qc.setQueryData(['messages', 'c1'], [msg('A', 1)]);
    let loads = 0;
    const unsubscribe = observe(async () => {
      if (loads++ === 0) throw new Error('offline');
      return [msg('A', 1), msg('B', 2)];
    });
    getMessages.mockRejectedValue(new Error('offline'));
    await mount();

    await act(async () => sockets[0].fire('connect'));
    await vi.waitFor(() => expect(loads).toBe(1));
    expect(synced).toBe(false);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1300));
    });
    expect(synced).toBe(true);
    expect(ids()).toEqual(['A', 'B']);
    unsubscribe();
  });

  it('lets no recovery from the previous account touch the next session', async () => {
    qc.setQueryData(['messages', 'c1'], [msg('A', 1)]);
    let rejectOld!: (error: Error) => void;
    getMessages.mockReturnValueOnce(new Promise((_, reject) => (rejectOld = reject)));
    await mount();
    await act(async () => sockets[0].fire('connect'));
    expect(getMessages).toHaveBeenCalledTimes(1);

    await act(async () => {
      useAuthStore.getState().logout();
      qc.clear();
      useAuthStore.getState().login(user('second'), tokens('second'));
    });
    let loads = 0;
    const unsubscribe = observe(async () => {
      loads++;
      return [msg('second-session', 9)];
    });
    await vi.waitFor(() => expect(ids()).toEqual(['second-session']));
    const reset = vi.spyOn(qc, 'resetQueries');
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const syncedBefore = synced;

    await act(async () => {
      rejectOld(new Error('offline'));
      await new Promise((r) => setTimeout(r, 1500));
    });

    expect(loads).toBe(1);
    expect(reset).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(synced).toBe(syncedBefore);
    expect(ids()).toEqual(['second-session']);
    unsubscribe();
  });
});
