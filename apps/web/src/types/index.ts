export interface User {
  _id: string;
  email?: string;
  handle: string;
  displayName: string;
  bio: string;
  avatar: string;
  coverImage: string;
  location: string;
  website: string;
  isVerified: boolean;
  followerCount: number;
  followingCount: number;
  isFollowing?: boolean;
  postCount?: number;
  createdAt?: string;
}

export type Author = Pick<User, '_id' | 'handle' | 'displayName' | 'avatar' | 'isVerified'>;

export interface Post {
  _id: string;
  author: Author;
  content: string;
  images: string[];
  likeCount: number;
  commentsCount: number;
  isEdited: boolean;
  isLiked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  _id: string;
  post: string;
  author: Author;
  content: string;
  parentComment?: string | null;
  likeCount: number;
  isLiked: boolean;
  isEdited: boolean;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Reply extends Omit<Comment, 'post' | 'isLiked' | 'replyCount'> {
  post: { _id: string; content: string; author: Pick<User, 'handle' | 'displayName'> };
}

export type NotificationType = 'like' | 'comment' | 'reply' | 'follow' | 'mention';

export interface Notification {
  _id: string;
  recipient: string;
  sender: Author;
  type: NotificationType;
  post?: { _id: string; content: string; images: string[] } | null;
  comment?: { _id: string; content: string } | null;
  isRead: boolean;
  createdAt: string;
}

export interface Conversation {
  _id: string;
  participant: User;
  lastMessage: { content: string; sender: string; createdAt: string } | null;
  unreadCount: number;
  updatedAt: string;
}

export interface Message {
  _id: string;
  conversation: string;
  sender: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface TrendingTopic {
  tag: string;
  count: number;
}

export interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
  unreadCount?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: Meta;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface Page<T> {
  items: T[];
  meta: Meta;
}
