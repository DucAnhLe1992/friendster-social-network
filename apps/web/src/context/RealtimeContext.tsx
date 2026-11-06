import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient, SERVER_ORIGIN } from '@/lib/api';
import {
  applyLiveMessage,
  catchUp,
  LiveBuffer,
  mergeCursors,
  snapshotCursors,
  type SyncCursors,
} from '@/lib/messageSync';
import { useAuthStore } from '@/store/authStore';
import type { Message, Notification } from '@/types';

interface ServerEvents {
  new_message: (data: { conversationId: string; message: Message }) => void;
  new_notification: (notification: Notification) => void;
  user_typing: (data: { conversationId: string; userId: string; isTyping: boolean }) => void;
  conversation_read: (data: { conversationId: string; userId: string }) => void;
}

interface ClientEvents {
  typing_start: (conversationId: string) => void;
  typing_stop: (conversationId: string) => void;
}

export type RealtimeSocket = Socket<ServerEvents, ClientEvents>;

interface RealtimeState {
  socket: RealtimeSocket | null;
  /** False until the socket is connected and every loaded thread has been reconciled with the server. */
  synced: boolean;
  /** Live messages received while a thread is loading; thread loads must go through `liveBuffer.snapshot`. */
  liveBuffer: LiveBuffer;
}

const RealtimeContext = createContext<RealtimeState>({ socket: null, synced: false, liveBuffer: new LiveBuffer() });

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;

const NOTIFICATION_TEXT: Record<Notification['type'], string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  follow: 'started following you',
  mention: 'mentioned you',
};

export const RealtimeProvider = ({ children }: { children: ReactNode }) => {
  const accessToken = useAuthStore((s) => s.tokens?.accessToken);
  const myId = useAuthStore((s) => s.user?._id);
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const [synced, setSynced] = useState(false);
  const gap = useRef<{ userId: string | undefined; cursors: SyncCursors } | null>(null);
  const [liveBuffer] = useState(() => new LiveBuffer());

  useEffect(() => {
    if (!accessToken) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    // Keep the earliest cursor of an outage: live messages that arrive first must not hide the gap behind them.
    const markGap = () => {
      clearTimeout(retryTimer);
      if (!gap.current || gap.current.userId !== myId) gap.current = { userId: myId, cursors: snapshotCursors(queryClient) };
      setSynced(false);
    };

    const next: RealtimeSocket = io(SERVER_ORIGIN, { auth: { token: accessToken }, transports: ['websocket', 'polling'] });

    next.on('new_notification', (notification) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread', 'notifications'] });
      if (notification?.sender?.displayName) {
        toast(`${notification.sender.displayName} ${NOTIFICATION_TEXT[notification.type] ?? 'interacted with you'}`);
      }
    });

    next.on('new_message', ({ conversationId, message }) => {
      applyLiveMessage(queryClient, liveBuffer, conversationId, message);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (message.sender !== myId) queryClient.invalidateQueries({ queryKey: ['unread', 'messages'] });
    });

    next.on('conversation_read', () => {
      queryClient.invalidateQueries({ queryKey: ['unread', 'messages'] });
    });

    // Every connection, including the first, is a sync boundary: messages sent between a thread's HTTP load and the
    // socket subscribing would otherwise never arrive. Cursors are kept, and retried, until every thread reconciles.
    const sync = () => {
      const previous = gap.current;
      const outage = previous && previous.userId === myId ? previous.cursors : undefined;
      const pending = { userId: myId, cursors: mergeCursors(snapshotCursors(queryClient), outage) };
      gap.current = pending;
      setSynced(false);
      catchUp(queryClient, pending.cursors).then((failed) => {
        // A drop during catch-up keeps these cursors as the gap for the next connection.
        if (gap.current !== pending || !next.connected) return;
        if (failed.size === 0) {
          gap.current = null;
          attempt = 0;
          setSynced(true);
          return;
        }
        gap.current = { userId: myId, cursors: failed };
        const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt++);
        retryTimer = setTimeout(() => {
          if (next.connected) sync();
        }, delay);
      });
    };

    next.on('connect', () => {
      setSocket(next);
      clearTimeout(retryTimer);
      attempt = 0;
      sync();
    });
    next.on('disconnect', (reason) => {
      markGap();
      // The server drops sockets whose token expired; any authenticated request refreshes it and reconnects us.
      if (reason !== 'io server disconnect') return;
      apiClient
        .getUnreadNotifications()
        .catch(() => undefined)
        .finally(() => {
          if (useAuthStore.getState().tokens?.accessToken === accessToken) next.connect();
        });
    });
    return () => {
      markGap();
      next.disconnect();
      setSocket(null);
    };
  }, [accessToken, myId, queryClient, liveBuffer]);

  return <RealtimeContext.Provider value={{ socket, synced, liveBuffer }}>{children}</RealtimeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useRealtime = () => useContext(RealtimeContext);
