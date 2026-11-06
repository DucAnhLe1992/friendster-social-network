import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db, Tx } from '../database/db';
import { mediaTable } from '../database/schema';
import { removeUpload } from '../middleware/upload';

export const recordUploads = async (ownerId: string, paths: string[]): Promise<void> => {
  try {
    await db.insert(mediaTable).values(paths.map((path) => ({ ownerId, path })));
  } catch (error) {
    await Promise.all(paths.map(removeUpload));
    throw error;
  }
};

/**
 * Reserves each image for `postId` inside the post's own transaction: all-or-nothing, only the uploader's own unused
 * images qualify, and an image can belong to one post only. A false result must roll the transaction back.
 */
export const claimForPost = async (tx: Tx, postId: string, ownerId: string, paths: string[]): Promise<boolean> => {
  if (paths.length === 0) return true;
  if (new Set(paths).size !== paths.length) return false;
  const claimed = await tx
    .update(mediaTable)
    .set({ postId })
    .where(and(inArray(mediaTable.path, paths), eq(mediaTable.ownerId, ownerId), isNull(mediaTable.postId)))
    .returning({ id: mediaTable.id });
  return claimed.length === paths.length;
};

/**
 * Deletes uploads no post claimed within `maxAgeMs`. The delete re-checks `post_id IS NULL` under the row lock, so an
 * image is either claimed by a committed post or swept, never both.
 */
export const sweepAbandonedUploads = async (maxAgeMs: number): Promise<number> => {
  const removed = await db
    .delete(mediaTable)
    .where(and(isNull(mediaTable.postId), lt(mediaTable.createdAt, new Date(Date.now() - maxAgeMs))))
    .returning({ path: mediaTable.path });
  await Promise.all(removed.map(({ path }) => removeUpload(path)));
  return removed.length;
};
