import { Types } from 'mongoose';
import { Media, Post } from '../models';
import { removeUpload } from '../middleware/upload';

export const recordUploads = async (owner: Types.ObjectId, paths: string[]): Promise<void> => {
  await Media.insertMany(paths.map((path) => ({ owner, path })));
};

/** Atomically attaches each image to `postId`; all-or-nothing, and an image can belong to only one post. */
export const claimForPost = async (postId: Types.ObjectId, owner: Types.ObjectId, paths: string[]): Promise<boolean> => {
  if (new Set(paths).size !== paths.length) return false;
  for (const path of paths) {
    const claimed = await Media.findOneAndUpdate({ path, owner, post: null }, { $set: { post: postId } });
    if (!claimed) {
      await releaseClaims(postId);
      return false;
    }
  }
  return true;
};

export const releaseClaims = async (postId: Types.ObjectId): Promise<void> => {
  await Media.updateMany({ post: postId }, { $set: { post: null } });
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

/** Deletes uploads that were never attached to a post within `maxAgeMs`. */
export const sweepAbandonedUploads = async (maxAgeMs: number): Promise<number> => {
  const stale = await Media.find({ post: null, createdAt: { $lt: new Date(Date.now() - maxAgeMs) } })
    .select('path')
    .lean();
  let count = 0;
  for (const { _id, path } of stale) {
    const removed = await Media.deleteOne({ _id, post: null });
    if (!removed.deletedCount) continue;
    await removeUpload(path);
    count += 1;
  }
  return count;
};
