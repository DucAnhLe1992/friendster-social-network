import { Request } from 'express';
import type { UserRow } from '../database/schema';

export type { NotificationType } from '../database/schema';

/** The signed-in user as loaded per request; the password hash never leaves the database layer. */
export type AuthUser = Omit<UserRow, 'password'>;

// Auth Types
export interface IAuthRequest extends Request<Record<string, string>> {
  user?: AuthUser;
}

export interface ITokens {
  accessToken: string;
  refreshToken: string;
}

export interface ITokenPayload {
  userId: string;
  handle: string;
  role: string;
}

// API Response Types
export interface IApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
    nextCursor?: string | null;
    unreadCount?: number;
  };
  requestId?: string;
}

// Socket Types
export interface ServerToClientEvents {
  new_message: (data: { conversationId: string; message: unknown }) => void;
  user_typing: (data: { conversationId: string; userId: string; isTyping: boolean }) => void;
  conversation_read: (data: { conversationId: string; userId: string }) => void;
  new_notification: (notification: unknown) => void;
}

export interface ClientToServerEvents {
  typing_start: (conversationId: string) => void;
  typing_stop: (conversationId: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  handle: string;
  expiresAt: number;
}
