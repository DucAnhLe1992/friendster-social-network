import { sql, SQL } from 'drizzle-orm';
import {
  commentLikesTable,
  commentsTable,
  followsTable,
  postLikesTable,
  postsTable,
  usersTable,
} from '../database/schema';

type Users = typeof usersTable;

const viewerFlag = (viewerId: string | undefined, check: (viewer: string) => SQL): SQL<boolean> =>
  viewerId ? sql<boolean>`exists(${check(viewerId)})` : sql<boolean>`false`;

/** Columns for a post or comment author; pass an alias when users is joined more than once. */
export const authorColumns = (u: Users = usersTable) => ({
  _id: u.id,
  handle: u.handle,
  displayName: u.displayName,
  avatar: u.avatar,
  isVerified: u.isVerified,
});

/** The public profile shape, computed in SQL so counts and follow state are always current. */
export const publicUserColumns = (viewerId?: string, u: Users = usersTable) => ({
  ...authorColumns(u),
  bio: u.bio,
  coverImage: u.coverImage,
  location: u.location,
  website: u.website,
  followerCount: sql<number>`(select count(*)::int from ${followsTable} where ${followsTable.followingId} = ${u.id})`,
  followingCount: sql<number>`(select count(*)::int from ${followsTable} where ${followsTable.followerId} = ${u.id})`,
  isFollowing: viewerFlag(
    viewerId,
    (viewer) => sql`select 1 from ${followsTable} where ${followsTable.followerId} = ${viewer} and ${followsTable.followingId} = ${u.id}`
  ),
  createdAt: u.createdAt,
});

export const selfUserColumns = (u: Users = usersTable) => ({ ...publicUserColumns(undefined, u), email: u.email });

/** The only shape a post leaves the API in; select from posts joined to its author. */
export const publicPostColumns = (viewerId?: string) => ({
  _id: postsTable.id,
  author: authorColumns(),
  content: postsTable.content,
  images: postsTable.images,
  likeCount: sql<number>`(select count(*)::int from ${postLikesTable} where ${postLikesTable.postId} = ${postsTable.id})`,
  isLiked: viewerFlag(
    viewerId,
    (viewer) => sql`select 1 from ${postLikesTable} where ${postLikesTable.postId} = ${postsTable.id} and ${postLikesTable.userId} = ${viewer}`
  ),
  commentsCount: postsTable.commentsCount,
  sharesCount: postsTable.sharesCount,
  isEdited: postsTable.isEdited,
  createdAt: postsTable.createdAt,
  updatedAt: postsTable.updatedAt,
});

/** Comments joined to their author. */
export const publicCommentColumns = (viewerId?: string) => ({
  _id: commentsTable.id,
  post: commentsTable.postId,
  author: authorColumns(),
  content: commentsTable.content,
  parentComment: commentsTable.parentId,
  likeCount: sql<number>`(select count(*)::int from ${commentLikesTable} where ${commentLikesTable.commentId} = ${commentsTable.id})`,
  isLiked: viewerFlag(
    viewerId,
    (viewer) =>
      sql`select 1 from ${commentLikesTable} where ${commentLikesTable.commentId} = ${commentsTable.id} and ${commentLikesTable.userId} = ${viewer}`
  ),
  replyCount: sql<number>`(select count(*)::int from ${commentsTable} as replies where replies.parent_id = ${commentsTable.id})`,
  isEdited: commentsTable.isEdited,
  createdAt: commentsTable.createdAt,
  updatedAt: commentsTable.updatedAt,
});
