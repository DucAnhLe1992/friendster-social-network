import { Types } from 'mongoose';
import { Media, Post } from '../models';
import { removeUpload } from '../middleware/upload';

/** How long a claim may stay unfinished before the sweeper treats it as abandoned. */
export const CLAIM_LEASE_MS = 15 * 60 * 1000;

export const recordUploads = async (owner: Types.ObjectId, paths: string[]): Promise<void> => {
  await Media.insertMany(paths.map((path) => ({ owner, path })));
};

/** Atomically reserves each image for `postId`; all-or-nothing, and an image can belong to only one post. */
export const claimForPost = async (postId: Types.ObjectId, owner: Types.ObjectId, paths: string[]): Promise<boolean> => {
  if (new Set(paths).size !== paths.length) return false;
  for (const path of paths) {
    const claimed = await Media.findOneAndUpdate(
      { path, owner, post: null },
      { $set: { post: postId, state: 'claimed', claimedAt: new Date() } }
    );
    if (!claimed) {
      await releaseClaims(postId);
      return false;
    }
  }
  return true;
};

/**
 * Finalizes the claims once the post is saved. Returns false if the sweeper expired any claim first; each record
 * is decided by a single conditional write, so either this or the sweeper wins, never both.
 */
export const attachClaims = async (postId: Types.ObjectId, count: number): Promise<boolean> => {
  if (count === 0) return true;
  await Media.updateMany({ post: postId, state: 'claimed' }, { $set: { state: 'attached' } });
  return (await Media.countDocuments({ post: postId, state: 'attached' })) === count;
};

/** Only for posts that were never (successfully) published; frees their images for reuse. */
export const releaseClaims = async (postId: Types.ObjectId): Promise<void> => {
  await Media.updateMany({ post: postId }, { $set: { post: null, state: 'unclaimed', claimedAt: null } });
};

/** Removes a deleted post's images, keeping any file another post still references (pre-media legacy data). */
export const deletePostMedia = async (postId: Types.ObjectId, paths: string[]): Promise<void> => {
  await Media.deleteMany({ post: postId });
  await Promise.all(
    paths.map(async (path) => {
      if (!(await Post.exists({ images: path }))) await removeUpload(path);
    })
  );
};

/**
 * Deletes uploads never used within `maxAgeMs`, and claims whose post was never saved within `leaseMs` of claiming.
 * Every deletion is conditional on the record still being in the state it was selected in.
 */
export const sweepAbandonedUploads = async (maxAgeMs: number, leaseMs = CLAIM_LEASE_MS): Promise<number> => {
  const now = Date.now();
  const unclaimed = await Media.find({ post: null, createdAt: { $lt: new Date(now - maxAgeMs) } })
    .select('path')
    .lean();
  const expired = await Media.find({ state: 'claimed', claimedAt: { $lt: new Date(now - leaseMs) } })
    .select('path post claimedAt')
    .lean();

  let count = 0;
  const remove = async (filter: Record<string, unknown>, path: string) => {
    const removed = await Media.deleteOne(filter);
    if (!removed.deletedCount) return;
    await removeUpload(path);
    count += 1;
  };

  for (const { _id, path } of unclaimed) await remove({ _id, post: null }, path);
  for (const { _id, path, post, claimedAt } of expired) {
    // The post was saved but the process stopped before finalizing: finish the attach instead of deleting.
    if (await Post.exists({ _id: post })) {
      await Media.updateOne({ _id, state: 'claimed' }, { $set: { state: 'attached' } });
      continue;
    }
    await remove({ _id, state: 'claimed', post, claimedAt }, path);
  }
  return count;
};
