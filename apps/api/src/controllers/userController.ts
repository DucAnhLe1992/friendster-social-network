import { Response } from 'express';
import { and, count, desc, eq, ilike, notInArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../database/db';
import { commentLikesTable, commentsTable, followsTable, notificationsTable, postsTable, usersTable } from '../database/schema';
import { updateProfileSchema, escapeLike } from '../utils/validation';
import { authorColumns, publicUserColumns, selfUserColumns } from '../utils/serializers';
import { removeUpload, uploadedPath } from '../middleware/upload';
import { notify } from '../services/notifications';
import { IAuthRequest } from '../types';

const byHandle = (handle: string) => eq(usersTable.handle, handle.toLowerCase());

const findIdByHandle = async (handle: string) => {
  const [row] = await db.select({ id: usersTable.id }).from(usersTable).where(byHandle(handle)).limit(1);
  return row ?? null;
};

const loadSelf = async (id: string) => {
  const [user] = await db.select(selfUserColumns()).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return user;
};

const followerCountOf = async (id: string) => {
  const [{ total }] = await db.select({ total: count() }).from(followsTable).where(eq(followsTable.followingId, id));
  return total;
};

export const getUserByHandle = async (req: IAuthRequest, res: Response): Promise<void> => {
  const [user] = await db
    .select({
      ...publicUserColumns(req.user?.id),
      postCount: sql<number>`(select count(*)::int from ${postsTable} where ${postsTable.authorId} = ${usersTable.id})`,
    })
    .from(usersTable)
    .where(byHandle(req.params.handle))
    .limit(1);

  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  res.status(200).json({ success: true, data: { user } });
};

export const updateProfile = async (req: IAuthRequest, res: Response): Promise<void> => {
  const data = updateProfileSchema.parse(req.body);
  await db.update(usersTable).set({ ...data, updatedAt: new Date() }).where(eq(usersTable.id, req.user!.id));
  res.status(200).json({ success: true, data: { user: await loadSelf(req.user!.id) }, message: 'Profile updated' });
};

const saveImage = (field: 'avatar' | 'coverImage', folder: 'avatars' | 'covers') =>
  async (req: IAuthRequest, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    const newPath = uploadedPath(folder, req.file.filename);
    let previous: string | null | undefined;
    try {
      previous = await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ path: usersTable[field] })
          .from(usersTable)
          .where(eq(usersTable.id, req.user!.id))
          .for('update');
        if (!row) return undefined;
        await tx.update(usersTable).set({ [field]: newPath, updatedAt: new Date() }).where(eq(usersTable.id, req.user!.id));
        return row.path;
      });
    } catch (error) {
      await removeUpload(newPath);
      throw error;
    }
    if (previous === undefined) {
      await removeUpload(newPath);
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    await removeUpload(previous);
    res.status(200).json({ success: true, data: { user: await loadSelf(req.user!.id) } });
  };

export const uploadAvatar = saveImage('avatar', 'avatars');
export const uploadCover = saveImage('coverImage', 'covers');

export const followUser = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!.id;
  const target = await findIdByHandle(req.params.handle);
  if (!target) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  if (target.id === me) {
    res.status(400).json({ success: false, error: 'You cannot follow yourself' });
    return;
  }

  const inserted = await db
    .insert(followsTable)
    .values({ followerId: me, followingId: target.id })
    .onConflictDoNothing()
    .returning({ id: followsTable.followingId });
  if (inserted.length > 0) {
    await notify(req, { recipient: target.id, sender: me, type: 'follow' });
  }

  res.status(200).json({ success: true, data: { isFollowing: true, followerCount: await followerCountOf(target.id) } });
};

export const unfollowUser = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!.id;
  const target = await findIdByHandle(req.params.handle);
  if (!target) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  await Promise.all([
    db.delete(followsTable).where(and(eq(followsTable.followerId, me), eq(followsTable.followingId, target.id))),
    db
      .delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.recipientId, target.id),
          eq(notificationsTable.senderId, me),
          eq(notificationsTable.type, 'follow')
        )
      ),
  ]);

  res.status(200).json({ success: true, data: { isFollowing: false, followerCount: await followerCountOf(target.id) } });
};

const listConnections = (direction: 'followers' | 'following') =>
  async (req: IAuthRequest, res: Response): Promise<void> => {
    const user = await findIdByHandle(req.params.handle);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const [anchor, other] =
      direction === 'followers'
        ? [followsTable.followingId, followsTable.followerId]
        : [followsTable.followerId, followsTable.followingId];
    const users = await db
      .select(publicUserColumns(req.user?.id))
      .from(followsTable)
      .innerJoin(usersTable, eq(usersTable.id, other))
      .where(eq(anchor, user.id))
      .orderBy(desc(followsTable.createdAt))
      .limit(100);

    res.status(200).json({ success: true, data: { users } });
  };

export const getFollowers = listConnections('followers');
export const getFollowing = listConnections('following');

export const searchUsers = async (req: IAuthRequest, res: Response): Promise<void> => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 50) : '';
  if (!q) {
    res.status(400).json({ success: false, error: 'Search query required' });
    return;
  }

  const pattern = `%${escapeLike(q)}%`;
  const users = await db
    .select(publicUserColumns(req.user?.id))
    .from(usersTable)
    .where(or(ilike(usersTable.displayName, pattern), ilike(usersTable.handle, pattern)))
    .limit(20);

  res.status(200).json({ success: true, data: { users } });
};

export const getSuggestions = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!.id;
  const columns = publicUserColumns();
  const followed = db.select({ id: followsTable.followingId }).from(followsTable).where(eq(followsTable.followerId, me));

  const users = await db
    .select(columns)
    .from(usersTable)
    .where(and(sql`${usersTable.id} <> ${me}`, notInArray(usersTable.id, followed)))
    .orderBy(desc(columns.followerCount), desc(usersTable.createdAt))
    .limit(5);

  res.status(200).json({ success: true, data: { users } });
};

export const getUserReplies = async (req: IAuthRequest, res: Response): Promise<void> => {
  const user = await findIdByHandle(req.params.handle);
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  const postAuthor = alias(usersTable, 'post_author');
  const rows = await db
    .select({
      _id: commentsTable.id,
      post: { _id: postsTable.id, content: postsTable.content },
      postAuthor: { handle: postAuthor.handle, displayName: postAuthor.displayName },
      author: authorColumns(),
      content: commentsTable.content,
      parentComment: commentsTable.parentId,
      likeCount: sql<number>`(select count(*)::int from ${commentLikesTable} where ${commentLikesTable.commentId} = ${commentsTable.id})`,
      isEdited: commentsTable.isEdited,
      createdAt: commentsTable.createdAt,
      updatedAt: commentsTable.updatedAt,
    })
    .from(commentsTable)
    .innerJoin(usersTable, eq(usersTable.id, commentsTable.authorId))
    .innerJoin(postsTable, eq(postsTable.id, commentsTable.postId))
    .innerJoin(postAuthor, eq(postAuthor.id, postsTable.authorId))
    .where(eq(commentsTable.authorId, user.id))
    .orderBy(desc(commentsTable.createdAt), desc(commentsTable.id))
    .limit(50);
  const replies = rows.map(({ postAuthor: author, post, ...reply }) => ({ ...reply, post: { ...post, author } }));

  res.status(200).json({ success: true, data: { replies } });
};
