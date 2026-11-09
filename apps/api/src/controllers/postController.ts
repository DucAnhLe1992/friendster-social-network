import { Request, Response } from 'express';
import { and, count, desc, eq, gte, inArray, or, sql, SQL } from 'drizzle-orm';
import { db } from '../database/db';
import { followsTable, notificationsTable, postLikesTable, postsTable, usersTable } from '../database/schema';
import { createPostSchema, updatePostSchema, postPageSchema, profileTabSchema, encodePostCursor } from '../utils/validation';
import { publicPostColumns } from '../utils/serializers';
import { uploadedPath } from '../middleware/upload';
import { claimForPost, enqueueFileDeletions, processFileDeletionJobs, recordUploads } from '../services/media';
import { isDuplicateKey, isForeignKeyViolation } from '../middleware/errorHandler';
import { notify } from '../services/notifications';
import { IApiResponse, IAuthRequest } from '../types';

const selectPosts = (viewerId?: string) =>
  db.select(publicPostColumns(viewerId)).from(postsTable).innerJoin(usersTable, eq(usersTable.id, postsTable.authorId));

const findPost = async (id: string, viewerId?: string) => {
  const [post] = await selectPosts(viewerId).where(eq(postsTable.id, id)).limit(1);
  return post ?? null;
};

// Keyset pagination on (created_at, id): new posts never shift later pages, and no count(*) per request.
const listPosts = async (req: IAuthRequest, res: Response, where?: SQL): Promise<void> => {
  const { cursor, limit } = postPageSchema.parse(req.query);
  const after = cursor
    ? sql`(${postsTable.createdAt}, ${postsTable.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id})`
    : undefined;

  const rows = await selectPosts(req.user?.id)
    .where(and(where, after))
    .orderBy(desc(postsTable.createdAt), desc(postsTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const posts = hasMore ? rows.slice(0, limit) : rows;
  const last = posts.at(-1);

  const response: IApiResponse = {
    success: true,
    data: { posts },
    meta: {
      limit,
      hasMore,
      nextCursor: hasMore && last ? encodePostCursor({ createdAt: last.createdAt.toISOString(), id: last._id }) : null,
    },
  };
  res.status(200).json(response);
};

export const getFeed = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!.id;
  const following = db
    .select({ id: followsTable.followingId })
    .from(followsTable)
    .where(eq(followsTable.followerId, me));
  await listPosts(req, res, or(eq(postsTable.authorId, me), inArray(postsTable.authorId, following)));
};

export const getAllPosts = async (req: IAuthRequest, res: Response): Promise<void> => {
  await listPosts(req, res);
};

export const getUserPosts = async (req: IAuthRequest, res: Response): Promise<void> => {
  const tab = profileTabSchema.parse(req.query.tab);
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.handle, req.params.handle.toLowerCase()))
    .limit(1);
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  const filters: Record<typeof tab, SQL> = {
    posts: eq(postsTable.authorId, user.id),
    media: and(eq(postsTable.authorId, user.id), sql`cardinality(${postsTable.images}) > 0`)!,
    likes: sql`exists(select 1 from ${postLikesTable} where ${postLikesTable.postId} = ${postsTable.id} and ${postLikesTable.userId} = ${user.id})`,
  };
  await listPosts(req, res, filters[tab]);
};

export const getPost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const post = await findPost(req.params.id, req.user?.id);
  if (!post) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }
  res.status(200).json({ success: true, data: { post } });
};

export const uploadPostImages = async (req: IAuthRequest, res: Response): Promise<void> => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ success: false, error: 'No images uploaded' });
    return;
  }
  const images = files.map((file) => uploadedPath('posts', file.filename));
  await recordUploads(req.user!.id, images);
  res.status(201).json({ success: true, data: { images } });
};

class ImagesUnavailable extends Error {}

const samePayload = (post: { content: string; images: string[] }, data: { content: string; images: string[] }) =>
  post.content === data.content &&
  post.images.length === data.images.length &&
  post.images.every((image, i) => image === data.images[i]);

export const createPost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const data = createPostSchema.parse(req.body);
  const me = req.user!.id;

  const send = async (id: string, status: number) => {
    res.status(status).json({ success: true, data: { post: await findPost(id, me) }, message: 'Post created successfully' });
  };

  // A retry with the same client ID resolves to the original post instead of publishing a second copy.
  const replayExisting = async (): Promise<boolean> => {
    if (!data.clientId) return false;
    const [existing] = await db
      .select({ id: postsTable.id, content: postsTable.content, images: postsTable.images })
      .from(postsTable)
      .where(and(eq(postsTable.authorId, me), eq(postsTable.clientId, data.clientId)))
      .limit(1);
    if (!existing) return false;
    if (samePayload(existing, data)) await send(existing.id, 200);
    else res.status(409).json({ success: false, error: 'This post ID was already used for a different post' });
    return true;
  };

  if (await replayExisting()) return;

  // The post and its image claims commit together, so a post is never visible with images it does not own.
  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(postsTable)
        .values({ authorId: me, content: data.content, images: data.images, clientId: data.clientId ?? null })
        .returning({ id: postsTable.id });
      if (!(await claimForPost(tx, post.id, me, data.images))) throw new ImagesUnavailable();
      return post.id;
    });
  } catch (error) {
    // A concurrent request with the same client ID may have won the insert or be holding the images.
    if ((isDuplicateKey(error) || error instanceof ImagesUnavailable) && (await replayExisting())) return;
    if (error instanceof ImagesUnavailable) {
      res.status(400).json({ success: false, error: 'One or more images are invalid. Please upload them again.' });
      return;
    }
    throw error;
  }
  await send(id, 201);
};

export const updatePost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { content } = updatePostSchema.parse(req.body);

  const [updated] = await db
    .update(postsTable)
    .set({ content, isEdited: true, updatedAt: new Date() })
    .where(and(eq(postsTable.id, req.params.id), eq(postsTable.authorId, req.user!.id)))
    .returning({ id: postsTable.id });

  if (!updated) {
    res.status(404).json({ success: false, error: 'Post not found or unauthorized' });
    return;
  }

  res.status(200).json({
    success: true,
    data: { post: await findPost(updated.id, req.user!.id) },
    message: 'Post updated successfully',
  });
};

export const deletePost = async (req: IAuthRequest, res: Response): Promise<void> => {
  // Comments, likes, notifications and image records go with the post through ON DELETE CASCADE.
  const post = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(postsTable)
      .where(and(eq(postsTable.id, req.params.id), eq(postsTable.authorId, req.user!.id)))
      .returning({ images: postsTable.images });
    if (deleted) await enqueueFileDeletions(tx, deleted.images);
    return deleted;
  });
  if (!post) {
    res.status(404).json({ success: false, error: 'Post not found or unauthorized' });
    return;
  }

  await processFileDeletionJobs();
  res.status(200).json({ success: true, message: 'Post deleted successfully' });
};

const likeCountOf = async (postId: string) => {
  const [{ total }] = await db.select({ total: count() }).from(postLikesTable).where(eq(postLikesTable.postId, postId));
  return total;
};

const findAuthor = async (postId: string) => {
  const [post] = await db.select({ authorId: postsTable.authorId }).from(postsTable).where(eq(postsTable.id, postId)).limit(1);
  return post?.authorId ?? null;
};

export const likePost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!.id;
  const postId = req.params.id;
  const authorId = await findAuthor(postId);
  if (!authorId) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }

  let inserted: { postId: string }[];
  try {
    inserted = await db
      .insert(postLikesTable)
      .values({ postId, userId: me })
      .onConflictDoNothing()
      .returning({ postId: postLikesTable.postId });
  } catch (error) {
    // The post was deleted between the lookup and the insert.
    if (isForeignKeyViolation(error)) {
      res.status(404).json({ success: false, error: 'Post not found' });
      return;
    }
    throw error;
  }
  if (inserted.length > 0) await notify(req, { recipient: authorId, sender: me, type: 'like', post: postId });

  res.status(200).json({ success: true, data: { likeCount: await likeCountOf(postId), isLiked: true } });
};

export const unlikePost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!.id;
  const postId = req.params.id;
  const authorId = await findAuthor(postId);
  if (!authorId) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(postLikesTable).where(and(eq(postLikesTable.postId, postId), eq(postLikesTable.userId, me)));
    await tx
      .delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.recipientId, authorId),
          eq(notificationsTable.senderId, me),
          eq(notificationsTable.type, 'like'),
          eq(notificationsTable.postId, postId)
        )
      );
  });
  res.status(200).json({ success: true, data: { likeCount: await likeCountOf(postId), isLiked: false } });
};

export const getTrending = async (_req: Request, res: Response): Promise<void> => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const posts = await db
    .select({ content: postsTable.content })
    .from(postsTable)
    .where(and(gte(postsTable.createdAt, since), sql`${postsTable.content} ~ '#\\w'`))
    .orderBy(desc(postsTable.createdAt))
    .limit(1000);

  const counts = new Map<string, number>();
  for (const { content } of posts) {
    const tags = new Set((content.match(/#[a-zA-Z0-9_]{2,30}/g) ?? []).map((t) => t.toLowerCase()));
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  const topics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));

  res.status(200).json({ success: true, data: { topics } });
};

export const searchPosts = async (req: IAuthRequest, res: Response): Promise<void> => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (!q) {
    res.status(400).json({ success: false, error: 'Search query required' });
    return;
  }
  await listPosts(req, res, sql`to_tsvector('simple', ${postsTable.content}) @@ plainto_tsquery('simple', ${q})`);
};
