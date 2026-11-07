import { and, asc, eq, inArray, isNull, lte, lt, or, sql } from 'drizzle-orm';
import { db, Tx } from '../database/db';
import { fileDeletionsTable, mediaTable } from '../database/schema';
import { removeUpload } from '../middleware/upload';

const FILE_DELETE_LEASE_MS = 5 * 60 * 1000;
const FILE_DELETE_BATCH_SIZE = 100;

export const enqueueFileDeletions = async (tx: Tx, paths: string[]): Promise<void> => {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (uniquePaths.length === 0) return;
  await tx.insert(fileDeletionsTable).values(uniquePaths.map((path) => ({ path }))).onConflictDoNothing();
};

export const processFileDeletionJobs = async (): Promise<{ completed: number; failed: number }> => {
  const now = new Date();
  const staleClaim = new Date(now.getTime() - FILE_DELETE_LEASE_MS);
  const jobs = await db.transaction(async (tx) => {
    const available = await tx
      .select({ id: fileDeletionsTable.id, path: fileDeletionsTable.path, attempts: fileDeletionsTable.attempts })
      .from(fileDeletionsTable)
      .where(and(lte(fileDeletionsTable.availableAt, now), or(isNull(fileDeletionsTable.claimedAt), lt(fileDeletionsTable.claimedAt, staleClaim))))
      .orderBy(asc(fileDeletionsTable.availableAt), asc(fileDeletionsTable.requestedAt))
      .limit(FILE_DELETE_BATCH_SIZE)
      .for('update', { skipLocked: true });
    if (available.length === 0) return [];

    await tx
      .update(fileDeletionsTable)
      .set({ claimedAt: now, attempts: sql`${fileDeletionsTable.attempts} + 1` })
      .where(inArray(fileDeletionsTable.id, available.map(({ id }) => id)));
    return available.map((job) => ({ ...job, attempts: job.attempts + 1 }));
  });

  let completed = 0;
  let failed = 0;
  await Promise.all(
    jobs.map(async (job) => {
      try {
        await removeUpload(job.path);
        await db.delete(fileDeletionsTable).where(eq(fileDeletionsTable.id, job.id));
        completed += 1;
      } catch (error) {
        failed += 1;
        const delayMs = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(job.attempts, 12));
        await db
          .update(fileDeletionsTable)
          .set({
            claimedAt: null,
            availableAt: new Date(Date.now() + delayMs),
            lastError: error instanceof Error ? error.message.slice(0, 1000) : 'File deletion failed',
          })
          .where(eq(fileDeletionsTable.id, job.id));
      }
    })
  );
  return { completed, failed };
};

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
  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(mediaTable)
      .where(and(isNull(mediaTable.postId), lt(mediaTable.createdAt, new Date(Date.now() - maxAgeMs))))
      .returning({ path: mediaTable.path });
    await enqueueFileDeletions(tx, rows.map(({ path }) => path));
    return rows;
  });
  await processFileDeletionJobs();
  return removed.length;
};
