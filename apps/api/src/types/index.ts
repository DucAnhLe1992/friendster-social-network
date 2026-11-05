import { Request } from 'express';
import { Document, Types } from 'mongoose';

// User Types
export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  handle: string;
  displayName: string;
  bio: string;
  avatar: string;
  coverImage: string;
  location: string;
  website: string;
  followers: Types.ObjectId[];
  following: Types.ObjectId[];
  isVerified: boolean;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  followerCount: number;
  followingCount: number;
}

// Post Types
export interface IPost extends Document {
  _id: Types.ObjectId;
  author: Types.ObjectId | IUser;
  content: string;
  images: string[];
  likes: Types.ObjectId[];
  commentsCount: number;
  sharesCount: number;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
  likeCount: number;
}

// Comment Types
export interface IComment extends Document {
  _id: Types.ObjectId;
  post: Types.ObjectId;
  author: Types.ObjectId | IUser;
  content: string;
  parentComment?: Types.ObjectId | null;
  likes: Types.ObjectId[];
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
  likeCount: number;
}

// Notification Types
export type NotificationType = 'like' | 'comment' | 'reply' | 'follow' | 'mention';

export interface INotification extends Document {
  _id: Types.ObjectId;
  recipient: Types.ObjectId;
  sender: Types.ObjectId | IUser;
  type: NotificationType;
  post?: Types.ObjectId;
  comment?: Types.ObjectId;
  isRead: boolean;
  createdAt: Date;
}

// Message Types
export interface IMessage extends Document {
  _id: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: Types.ObjectId | IUser;
  content: string;
  isRead: boolean;
  createdAt: Date;
}

export interface IConversation extends Document {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];
  lastMessage?: Types.ObjectId | IMessage | null;
  unreadCount: Map<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

// Story Types
export interface IStory extends Document {
  _id: Types.ObjectId;
  author: Types.ObjectId | IUser;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  views: Types.ObjectId[];
  expiresAt: Date;
  createdAt: Date;
  viewCount: number;
}

// Auth Types
export interface IAuthRequest extends Request<Record<string, string>> {
  user?: IUser;
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
    unreadCount?: number;
  };
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
}
