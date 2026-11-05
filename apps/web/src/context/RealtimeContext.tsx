import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient, SERVER_ORIGIN } from '@/lib/api';
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

const RealtimeContext = createContext<RealtimeSocket | null>(null);

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

  useEffect(() => {
    if (!accessToken) return;

    const next: RealtimeSocket = io(SERVER_ORIGIN, { auth: { token: accessToken }, transports: ['websocket', 'polling'] });

    next.on('new_notification', (notification) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread', 'notifications'] });
      if (notification?.sender?.displayName) {
        toast(`${notification.sender.displayName} ${NOTIFICATION_TEXT[notification.type] ?? 'interacted with you'}`);
      }
    });

    next.on('new_message', ({ conversationId, message }) => {
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) =>
        old && !old.some((m) => m._id === message._id) ? [...old, message] : old
      );
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (message.sender !== myId) queryClient.invalidateQueries({ queryKey: ['unread', 'messages'] });
    });

    next.on('conversation_read', () => {
      queryClient.invalidateQueries({ queryKey: ['unread', 'messages'] });
    });

    next.on('connect', () => setSocket(next));
    next.on('disconnect', (reason) => {
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
      next.disconnect();
      setSocket(null);
    };
  }, [accessToken, myId, queryClient]);

  return <RealtimeContext.Provider value={socket}>{children}</RealtimeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useRealtime = () => useContext(RealtimeContext);
