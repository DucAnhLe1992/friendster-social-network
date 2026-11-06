import { Types } from 'mongoose';
import { Media, Post } from '../models';
import { removeUpload } from '../middleware/upload';

/** How long a claim may stay unfinished before the sweeper treats it as abandoned. */
export const CLAIM_LEASE_MS = 15 * 60 * 1000;

export const recordUploads = async (owner: Types.ObjectId, paths: string[]): Promise<void> => {
  try {
    await Media.insertMany(paths.map((path) => ({ owner, path })));
  } catch (error) {
    await Media.deleteMany({ owner, path: { $in: paths } }).catch(() => undefined);
    await Promise.all(paths.map(removeUpload));
    throw error;
  }
};

/** Atomically reserves each image for `postId`; all-or-nothing, and an image can belong to only one post. */
export const claimForPost = async (postId: Types.ObjectId, owner: Types.ObjectId, paths: string[]): Promise<boolean> => {
  if (new Set(paths).size !== paths.length) return false;
  try {
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
  } catch (error) {
    // Otherwise the partial claims would expire and the sweeper would delete images the user can still retry with.
    await releaseClaims(postId).catch(() => undefined);
    throw error;
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

const findAnyPost = (filter: Record<string, unknown>) =>
  Post.findOne(filter).setOptions({ includePending: true }).select('status images').lean();

/**
 * The commit point of publication: flips a pending post to published. Returns false if a reconciler aborted the post
 * first. Safe to call more than once; a post another caller already published counts as success.
 */
export const publishPost = async (postId: Types.ObjectId): Promise<boolean> => {
  await Post.updateOne({ _id: postId, status: 'pending' }, { $set: { status: 'published' } });
  return Boolean(await Post.exists({ _id: postId, status: 'published' }));
};

/** Finishes a pending post's publication if every one of its images is still available. */
export const completePublication = async (postId: Types.ObjectId, imageCount: number): Promise<boolean> =>
  (await attachClaims(postId, imageCount)) && (await publishPost(postId));

/** Undoes a publication that did not commit. A post that did get published is left untouched. */
export const abortPublication = async (postId: Types.ObjectId): Promise<void> => {
  await Post.deleteOne({ _id: postId, status: 'pending' });
  if (await findAnyPost({ _id: postId })) return;
  await releaseClaims(postId);
};

/** Removes a deleted post's images, keeping any file another post still references (pre-media legacy data). */
export const deletePostMedia = async (postId: Types.ObjectId, paths: string[]): Promise<void> => {
  await Media.deleteMany({ post: postId });
  await Promise.all(
    paths.map(async (path) => {
      if (!(await findAnyPost({ images: path }))) await removeUpload(path);
    })
  );
};

/** Completes or aborts posts whose publication was interrupted; neither outcome ever exposes missing images. */
const reconcilePendingPosts = async (leaseMs: number) => {
  const stale = await Post.find({ status: 'pending', createdAt: { $lt: new Date(Date.now() - leaseMs) } })
    .select('images')
    .lean();
  for (const { _id, images } of stale) {
    if (!(await completePublication(_id, images.length))) await abortPublication(_id);
  }
};

/**
 * Settles interrupted publications, then deletes uploads never used within `maxAgeMs` and claims whose post was
 * never saved within `leaseMs` of claiming. Every deletion is conditional on the record's state when selected.
 */
export const sweepAbandonedUploads = async (maxAgeMs: number, leaseMs = CLAIM_LEASE_MS): Promise<number> => {
  await reconcilePendingPosts(leaseMs);
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
    const owner = await findAnyPost({ _id: post });
    // A pending post is still being published (or will be settled by the next reconcile); leave its images alone.
    if (owner?.status === 'pending') continue;
    if (owner) {
      await Media.updateOne({ _id, state: 'claimed' }, { $set: { state: 'attached' } });
      continue;
    }
    await remove({ _id, state: 'claimed', post, claimedAt }, path);
  }
  return count;
};
