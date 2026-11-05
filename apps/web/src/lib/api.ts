import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import type {
  ApiResponse,
  Comment,
  Conversation,
  Message,
  Meta,
  Notification,
  Page,
  Post,
  Reply,
  Tokens,
  TrendingTopic,
  User,
} from '@/types';

export const API_BASE_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const SERVER_ORIGIN = new URL(API_BASE_URL, window.location.origin).origin;

export const mediaUrl = (path?: string | null): string | undefined => {
  if (!path) return undefined;
  return /^https?:\/\//.test(path) ? path : `${SERVER_ORIGIN}${path}`;
};

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const tokens = useAuthStore.getState().tokens;
  if (tokens?.accessToken) config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  return config;
});

let refreshing: Promise<Tokens | null> | null = null;

const refreshTokens = (): Promise<Tokens | null> => {
  const refreshToken = useAuthStore.getState().tokens?.refreshToken;
  if (!refreshToken) return Promise.resolve(null);

  refreshing ??= axios
    .post<ApiResponse<{ tokens: Tokens }>>(`${API_BASE_URL}/auth/refresh`, { refreshToken })
    .then((res) => res.data.data?.tokens ?? null)
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');

    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      const tokens = await refreshTokens();
      if (tokens) {
        useAuthStore.getState().setTokens(tokens);
        original.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return api(original);
      }
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export const getErrorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Cannot reach the server. Check your connection and try again.';
    return (error.response.data as ApiResponse | undefined)?.error || fallback;
  }
  return fallback;
};

const unwrap = async <T>(request: Promise<{ data: ApiResponse<T> }>): Promise<T> => {
  const { data } = await request;
  if (!data.success || data.data === undefined) throw new Error(data.error || 'Unexpected response');
  return data.data;
};

const unwrapPage = async <T>(request: Promise<{ data: ApiResponse }>, key: string): Promise<Page<T>> => {
  const { data } = await request;
  const items = (data.data as Record<string, unknown> | undefined)?.[key];
  if (!data.success || !Array.isArray(items)) throw new Error(data.error || 'Unexpected response');
  return { items: items as T[], meta: data.meta ?? {} };
};

type AuthPayload = { user: User; tokens: Tokens };
export type ProfileTab = 'posts' | 'media' | 'likes';

export const apiClient = {
  // Auth
  login: (email: string, password: string) =>
    unwrap(api.post<ApiResponse<AuthPayload>>('/auth/login', { email, password })),
  register: (data: { email: string; password: string; handle: string; displayName: string }) =>
    unwrap(api.post<ApiResponse<AuthPayload>>('/auth/register', data)),
  getMe: () => unwrap(api.get<ApiResponse<{ user: User }>>('/auth/me')).then((d) => d.user),

  // Posts
  getFeed: (page: number) => unwrapPage<Post>(api.get('/posts/feed', { params: { page, limit: 10 } }), 'posts'),
  getAllPosts: (page: number) => unwrapPage<Post>(api.get('/posts', { params: { page, limit: 10 } }), 'posts'),
  searchPosts: (q: string, page: number) =>
    unwrapPage<Post>(api.get('/posts/search', { params: { q, page, limit: 10 } }), 'posts'),
  getUserPosts: (handle: string, tab: ProfileTab, page: number) =>
    unwrapPage<Post>(api.get(`/posts/user/${encodeURIComponent(handle)}`, { params: { tab, page, limit: 10 } }), 'posts'),
  getPost: (id: string) => unwrap(api.get<ApiResponse<{ post: Post }>>(`/posts/${id}`)).then((d) => d.post),
  getTrending: () => unwrap(api.get<ApiResponse<{ topics: TrendingTopic[] }>>('/posts/trending')).then((d) => d.topics),
  uploadPostImages: (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('images', file));
    return unwrap(api.post<ApiResponse<{ images: string[] }>>('/posts/images', form, { timeout: 60000 })).then((d) => d.images);
  },
  createPost: (content: string, images: string[]) =>
    unwrap(api.post<ApiResponse<{ post: Post }>>('/posts', { content, images })).then((d) => d.post),
  updatePost: (id: string, content: string) =>
    unwrap(api.put<ApiResponse<{ post: Post }>>(`/posts/${id}`, { content })).then((d) => d.post),
  deletePost: (id: string) => api.delete(`/posts/${id}`),
  likePost: (id: string) => unwrap(api.post<ApiResponse<{ likeCount: number }>>(`/posts/${id}/like`)),
  unlikePost: (id: string) => unwrap(api.delete<ApiResponse<{ likeCount: number }>>(`/posts/${id}/like`)),

  // Comments
  getComments: (postId: string, page: number) =>
    unwrapPage<Comment>(api.get(`/posts/${postId}/comments`, { params: { page, limit: 20 } }), 'comments'),
  getReplies: (postId: string, commentId: string) =>
    unwrapPage<Comment>(api.get(`/posts/${postId}/comments/${commentId}/replies`, { params: { limit: 50 } }), 'replies'),
  createComment: (postId: string, content: string, parentComment?: string) =>
    unwrap(api.post<ApiResponse<{ comment: Comment }>>(`/posts/${postId}/comments`, { content, parentComment })).then((d) => d.comment),
  updateComment: (postId: string, commentId: string, content: string) =>
    unwrap(api.put<ApiResponse<{ comment: Comment }>>(`/posts/${postId}/comments/${commentId}`, { content })).then((d) => d.comment),
  deleteComment: (postId: string, commentId: string) =>
    unwrap(api.delete<ApiResponse<{ removed: number }>>(`/posts/${postId}/comments/${commentId}`)).then((d) => d.removed),
  likeComment: (postId: string, commentId: string) =>
    unwrap(api.post<ApiResponse<{ likeCount: number }>>(`/posts/${postId}/comments/${commentId}/like`)),
  unlikeComment: (postId: string, commentId: string) =>
    unwrap(api.delete<ApiResponse<{ likeCount: number }>>(`/posts/${postId}/comments/${commentId}/like`)),

  // Users
  getUser: (handle: string) =>
    unwrap(api.get<ApiResponse<{ user: User }>>(`/users/${encodeURIComponent(handle)}`)).then((d) => d.user),
  getUserReplies: (handle: string) =>
    unwrap(api.get<ApiResponse<{ replies: Reply[] }>>(`/users/${encodeURIComponent(handle)}/replies`)).then((d) => d.replies),
  updateProfile: (data: Partial<Pick<User, 'displayName' | 'bio' | 'location' | 'website'>>) =>
    unwrap(api.put<ApiResponse<{ user: User }>>('/users/profile', data)).then((d) => d.user),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return unwrap(api.post<ApiResponse<{ user: User }>>('/users/avatar', form, { timeout: 60000 })).then((d) => d.user);
  },
  uploadCover: (file: File) => {
    const form = new FormData();
    form.append('cover', file);
    return unwrap(api.post<ApiResponse<{ user: User }>>('/users/cover', form, { timeout: 60000 })).then((d) => d.user);
  },
  followUser: (handle: string) =>
    unwrap(api.post<ApiResponse<{ isFollowing: boolean; followerCount: number }>>(`/users/${encodeURIComponent(handle)}/follow`)),
  unfollowUser: (handle: string) =>
    unwrap(api.delete<ApiResponse<{ isFollowing: boolean; followerCount: number }>>(`/users/${encodeURIComponent(handle)}/follow`)),
  getConnections: (handle: string, kind: 'followers' | 'following') =>
    unwrap(api.get<ApiResponse<{ users: User[] }>>(`/users/${encodeURIComponent(handle)}/${kind}`)).then((d) => d.users),
  searchUsers: (q: string) =>
    unwrap(api.get<ApiResponse<{ users: User[] }>>('/users/search', { params: { q } })).then((d) => d.users),
  getSuggestions: () => unwrap(api.get<ApiResponse<{ users: User[] }>>('/users/suggestions')).then((d) => d.users),

  // Notifications
  getNotifications: (page: number) =>
    unwrapPage<Notification>(api.get('/notifications', { params: { page, limit: 20 } }), 'notifications'),
  getUnreadNotifications: () =>
    unwrap(api.get<ApiResponse<{ unreadCount: number }>>('/notifications/unread-count')).then((d) => d.unreadCount),
  markNotificationAsRead: (id: string) => api.put(`/notifications/${id}/read`),
  markAllNotificationsAsRead: () => api.put('/notifications/read-all'),
  deleteNotification: (id: string) => api.delete(`/notifications/${id}`),

  // Messages
  getConversations: () =>
    unwrap(api.get<ApiResponse<{ conversations: Conversation[] }>>('/conversations')).then((d) => d.conversations),
  getUnreadMessages: () =>
    unwrap(api.get<ApiResponse<{ unreadCount: number }>>('/conversations/unread-count')).then((d) => d.unreadCount),
  startConversation: (handle: string) =>
    unwrap(api.post<ApiResponse<{ conversation: Conversation }>>('/conversations', { handle })).then((d) => d.conversation),
  getConversation: (id: string) =>
    unwrap(api.get<ApiResponse<{ conversation: Conversation }>>(`/conversations/${id}`)).then((d) => d.conversation),
  getMessages: async (id: string, before?: string): Promise<{ messages: Message[]; meta: Meta }> => {
    const { data } = await api.get<ApiResponse<{ messages: Message[] }>>(`/conversations/${id}/messages`, { params: { before } });
    if (!data.success || !Array.isArray(data.data?.messages)) throw new Error(data.error || 'Unexpected response');
    return { messages: data.data.messages, meta: data.meta ?? {} };
  },
  sendMessage: (id: string, content: string) =>
    unwrap(api.post<ApiResponse<{ message: Message }>>(`/conversations/${id}/messages`, { content })).then((d) => d.message),
  markConversationRead: (id: string) => api.post(`/conversations/${id}/read`),
};

export default apiClient;
