import { Response } from 'express';
import { and, asc, count, desc, eq, isNull, or, sql, SQL } from 'drizzle-orm';
import { db } from '../database/db';
import { commentLikesTable, commentsTable, postsTable, usersTable } from '../database/schema';
import { createCommentSchema, updateCommentSchema, paginationSchema } from '../utils/validation';
import { publicCommentColumns } from '../utils/serializers';
import { notify } from '../services/notifications';
import { IApiResponse, IAuthRequest } from '../types';

const selectComments = (viewerId?: string) =>
  db
    .select(publicCommentColumns(viewerId))
    .from(commentsTable)
    .innerJoin(usersTable, eq(usersTable.id, commentsTable.authorId));

const findComment = async (id: string, viewerId?: string) => {
  const [comment] = await selectComments(viewerId).where(eq(commentsTable.id, id)).limit(1);
  return comment ?? null;
};

const listComments = async (
  req: IAuthRequest,
  res: Response,
  where: SQL,
  newestFirst: boolean,
  key: 'comments' | 'replies'
): Promise<void> => {
  const { page, limit } = paginationSchema.parse(req.query);
  const offset = (page - 1) * limit;
  const order = newestFirst ? desc : asc;

  const [comments, [{ total }]] = await Promise.all([
    selectComments(req.user?.id)
      .where(where)
      .orderBy(order(commentsTable.createdAt), order(commentsTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(commentsTable).where(where),
  ]);

  const response: IApiResponse = {
    success: true,
    data: { [key]: key === 'replies' ? comments.map((c) => ({ ...c, replyCount: 0 })) : comments },
    meta: { page, limit, total, hasMore: offset + comments.length < total },
  };
  res.status(200).json(response);
};

export const getComments = async (req: IAuthRequest, res: Response): Promise<void> => {
  await listComments(req, res, and(eq(commentsTable.postId, req.params.id), isNull(commentsTable.parentId))!, true, 'comments');
};

export const getReplies = async (req: IAuthRequest, res: Response): Promise<void> => {
  const where = and(eq(commentsTable.postId, req.params.id), eq(commentsTable.parentId, req.params.commentId))!;
  await listComments(req, res, where, false, 'replies');
};

export const createComment = async (req: IAuthRequest, res: Response): Promise<void> => {
  const data = createCommentSchema.parse(req.body);
  const me = req.user!.id;

  const [post] = await db
    .select({ id: postsTable.id, authorId: postsTable.authorId })
    .from(postsTable)
    .where(eq(postsTable.id, req.params.id))
    .limit(1);
  if (!post) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }

  let parent = null;
  if (data.parentComment) {
    [parent] = await db
      .select({ id: commentsTable.id, authorId: commentsTable.authorId, parentId: commentsTable.parentId })
      .from(commentsTable)
      .where(and(eq(commentsTable.id, data.parentComment), eq(commentsTable.postId, post.id)))
      .limit(1);
    if (!parent) {
      res.status(404).json({ success: false, error: 'Comment not found' });
      return;
    }
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(commentsTable)
      .values({
        content: data.content,
        postId: post.id,
        authorId: me,
        // Replies to replies attach to the top-level thread
        parentId: parent ? parent.parentId ?? parent.id : null,
      })
      .returning({ id: commentsTable.id });
    await tx
      .update(postsTable)
      .set({ commentsCount: sql`${postsTable.commentsCount} + 1` })
      .where(eq(postsTable.id, post.id));
    return row;
  });

  await notify(req, { recipient: post.authorId, sender: me, type: 'comment', post: post.id, comment: created.id });
  if (parent && parent.authorId !== post.authorId) {
    await notify(req, { recipient: parent.authorId, sender: me, type: 'reply', post: post.id, comment: created.id });
  }

  res.status(201).json({ success: true, data: { comment: { ...(await findComment(created.id, me)), replyCount: 0 } } });
};

export const updateComment = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { content } = updateCommentSchema.parse(req.body);

  const [updated] = await db
    .update(commentsTable)
    .set({ content, isEdited: true, updatedAt: new Date() })
    .where(
      and(
        eq(commentsTable.id, req.params.commentId),
        eq(commentsTable.postId, req.params.id),
        eq(commentsTable.authorId, req.user!.id)
      )
    )
    .returning({ id: commentsTable.id });

  if (!updated) {
    res.status(404).json({ success: false, error: 'Comment not found or unauthorized' });
    return;
  }

  res.status(200).json({ success: true, data: { comment: await findComment(updated.id, req.user!.id) } });
};

export const deleteComment = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { commentId, id: postId } = req.params;

  // Replies and notifications about any removed comment go with it through ON DELETE CASCADE.
  const removed = await db.transaction(async (tx) => {
    const [own] = await tx
      .select({ id: commentsTable.id })
      .from(commentsTable)
      .where(and(eq(commentsTable.id, commentId), eq(commentsTable.postId, postId), eq(commentsTable.authorId, req.user!.id)))
      .for('update');
    if (!own) return 0;
    const gone = await tx
      .delete(commentsTable)
      .where(or(eq(commentsTable.id, own.id), eq(commentsTable.parentId, own.id)))
      .returning({ id: commentsTable.id });
    await tx
      .update(postsTable)
      .set({ commentsCount: sql`greatest(${postsTable.commentsCount} - ${gone.length}, 0)` })
      .where(eq(postsTable.id, postId));
    return gone.length;
  });

  if (!removed) {
    res.status(404).json({ success: false, error: 'Comment not found or unauthorized' });
    return;
  }
  res.status(200).json({ success: true, data: { removed } });
};

const toggleCommentLike = (liked: boolean) =>
  async (req: IAuthRequest, res: Response): Promise<void> => {
    const { commentId, id: postId } = req.params;
    const me = req.user!.id;
    const [comment] = await db
      .select({ id: commentsTable.id })
      .from(commentsTable)
      .where(and(eq(commentsTable.id, commentId), eq(commentsTable.postId, postId)))
      .limit(1);
    if (!comment) {
      res.status(404).json({ success: false, error: 'Comment not found' });
      return;
    }

    const mine = and(eq(commentLikesTable.commentId, comment.id), eq(commentLikesTable.userId, me));
    if (liked) await db.insert(commentLikesTable).values({ commentId: comment.id, userId: me }).onConflictDoNothing();
    else await db.delete(commentLikesTable).where(mine);

    const [{ total }] = await db
      .select({ total: count() })
      .from(commentLikesTable)
      .where(eq(commentLikesTable.commentId, comment.id));
    res.status(200).json({ success: true, data: { likeCount: total, isLiked: liked } });
  };

export const likeComment = toggleCommentLike(true);
export const unlikeComment = toggleCommentLike(false);
