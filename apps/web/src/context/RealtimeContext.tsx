import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient, SERVER_ORIGIN } from '@/lib/api';
import { applyLiveMessage, catchUp, mergeCursors, snapshotCursors, type SyncCursors } from '@/lib/messageSync';
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
}

const RealtimeContext = createContext<RealtimeState>({ socket: null, synced: false });

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

  useEffect(() => {
    if (!accessToken) return;

    // Keep the earliest cursor of an outage: live messages that arrive first must not hide the gap behind them.
    const markGap = () => {
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
      applyLiveMessage(queryClient, conversationId, message);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (message.sender !== myId) queryClient.invalidateQueries({ queryKey: ['unread', 'messages'] });
    });

    next.on('conversation_read', () => {
      queryClient.invalidateQueries({ queryKey: ['unread', 'messages'] });
    });

    // Every connection, including the first, is a sync boundary: messages sent between a thread's HTTP load and the
    // socket subscribing would otherwise never arrive. Outage cursors are kept until a catch-up fully succeeds.
    next.on('connect', () => {
      setSocket(next);
      const previous = gap.current;
      const outage = previous && previous.userId === myId ? previous.cursors : undefined;
      const pending = { userId: myId, cursors: mergeCursors(snapshotCursors(queryClient), outage) };
      gap.current = pending;
      setSynced(false);
      catchUp(queryClient, pending.cursors).then(() => {
        // A drop during catch-up keeps these cursors as the gap for the next connection.
        if (gap.current !== pending || !next.connected) return;
        gap.current = null;
        setSynced(true);
      });
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
  }, [accessToken, myId, queryClient]);

  return <RealtimeContext.Provider value={{ socket, synced }}>{children}</RealtimeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useRealtime = () => useContext(RealtimeContext);
