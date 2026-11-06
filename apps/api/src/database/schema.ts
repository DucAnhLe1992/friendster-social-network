import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { newId } from './ids';

const id = () => varchar('id', { length: 24 }).primaryKey().$defaultFn(newId);
const ref = (name: string) => varchar(name, { length: 24 });
const createdAt = () => timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow();

export const usersTable = pgTable('users', {
  id: id(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  password: varchar('password').notNull(),
  handle: varchar('handle', { length: 30 }).notNull().unique(),
  displayName: varchar('display_name', { length: 50 }).notNull(),
  bio: varchar('bio', { length: 160 }).notNull().default(''),
  avatar: text('avatar').notNull().default(''),
  coverImage: text('cover_image').notNull().default(''),
  location: varchar('location', { length: 30 }).notNull().default(''),
  website: varchar('website', { length: 100 }).notNull().default(''),
  isVerified: boolean('is_verified').notNull().default(false),
  role: varchar('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const followsTable = pgTable(
  'follows',
  {
    followerId: ref('follower_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    followingId: ref('following_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followingId] }), index('follows_following_idx').on(t.followingId)]
);

export const postsTable = pgTable(
  'posts',
  {
    id: id(),
    authorId: ref('author_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 280 }).notNull().default(''),
    images: text('images').array().notNull().default(sql`'{}'::text[]`),
    commentsCount: integer('comments_count').notNull().default(0),
    sharesCount: integer('shares_count').notNull().default(0),
    isEdited: boolean('is_edited').notNull().default(false),
    clientId: varchar('client_id', { length: 36 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('posts_author_created_idx').on(t.authorId, t.createdAt),
    index('posts_created_idx').on(t.createdAt),
    uniqueIndex('posts_author_client_idx').on(t.authorId, t.clientId),
    index('posts_content_search_idx').using('gin', sql`to_tsvector('simple', ${t.content})`),
  ]
);

export const postLikesTable = pgTable(
  'post_likes',
  {
    postId: ref('post_id').notNull().references(() => postsTable.id, { onDelete: 'cascade' }),
    userId: ref('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index('post_likes_user_idx').on(t.userId, t.createdAt)]
);

export const commentsTable = pgTable(
  'comments',
  {
    id: id(),
    postId: ref('post_id').notNull().references(() => postsTable.id, { onDelete: 'cascade' }),
    authorId: ref('author_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 280 }).notNull(),
    parentId: ref('parent_id').references((): AnyPgColumn => commentsTable.id, { onDelete: 'cascade' }),
    isEdited: boolean('is_edited').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('comments_post_created_idx').on(t.postId, t.createdAt),
    index('comments_parent_idx').on(t.parentId),
    index('comments_author_created_idx').on(t.authorId, t.createdAt),
  ]
);

export const commentLikesTable = pgTable(
  'comment_likes',
  {
    commentId: ref('comment_id').notNull().references(() => commentsTable.id, { onDelete: 'cascade' }),
    userId: ref('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })]
);

export const notificationsTable = pgTable(
  'notifications',
  {
    id: id(),
    recipientId: ref('recipient_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    senderId: ref('sender_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    type: varchar('type', { enum: ['like', 'comment', 'reply', 'follow', 'mention'] }).notNull(),
    postId: ref('post_id').references(() => postsTable.id, { onDelete: 'cascade' }),
    commentId: ref('comment_id').references(() => commentsTable.id, { onDelete: 'cascade' }),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_recipient_created_idx').on(t.recipientId, t.createdAt),
    index('notifications_recipient_unread_idx').on(t.recipientId, t.isRead),
  ]
);

export const conversationsTable = pgTable('conversations', {
  id: id(),
  pairKey: varchar('pair_key', { length: 49 }).notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const conversationParticipantsTable = pgTable(
  'conversation_participants',
  {
    conversationId: ref('conversation_id').notNull().references(() => conversationsTable.id, { onDelete: 'cascade' }),
    userId: ref('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index('participants_user_idx').on(t.userId)]
);

export const messagesTable = pgTable(
  'messages',
  {
    id: id(),
    conversationId: ref('conversation_id').notNull().references(() => conversationsTable.id, { onDelete: 'cascade' }),
    senderId: ref('sender_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 1000 }).notNull(),
    isRead: boolean('is_read').notNull().default(false),
    clientId: varchar('client_id', { length: 36 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('messages_conversation_created_idx').on(t.conversationId, t.createdAt, t.id),
    index('messages_unread_idx').on(t.conversationId, t.isRead, t.senderId),
    uniqueIndex('messages_client_idx').on(t.conversationId, t.senderId, t.clientId),
  ]
);

export const refreshSessionsTable = pgTable(
  'refresh_sessions',
  {
    id: id(),
    userId: ref('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    jti: varchar('jti', { length: 36 }).notNull().unique(),
    family: varchar('family', { length: 36 }).notNull(),
    issuedAt: integer('issued_at').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    successorJti: varchar('successor_jti', { length: 36 }),
    createdAt: createdAt(),
  },
  (t) => [index('refresh_sessions_user_idx').on(t.userId), index('refresh_sessions_family_idx').on(t.family)]
);

// One row per uploaded post image; `post_id` stays null until a post claims it, and an image belongs to one post only.
export const mediaTable = pgTable(
  'media',
  {
    id: id(),
    ownerId: ref('owner_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    path: text('path').notNull().unique(),
    postId: ref('post_id').references(() => postsTable.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [index('media_unclaimed_idx').on(t.postId, t.createdAt)]
);

export type UserRow = typeof usersTable.$inferSelect;
export type PostRow = typeof postsTable.$inferSelect;
export type CommentRow = typeof commentsTable.$inferSelect;
export type MessageRow = typeof messagesTable.$inferSelect;
export type NotificationType = (typeof notificationsTable.$inferInsert)['type'];
