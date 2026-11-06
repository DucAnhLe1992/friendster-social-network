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

/** Deletes uploads never attached to a post, or claimed by a post that was never saved, within `maxAgeMs`. */
export const sweepAbandonedUploads = async (maxAgeMs: number): Promise<number> => {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const unclaimed = await Media.find({ post: null, createdAt: { $lt: cutoff } }).select('path post').lean();
  // A crash between claiming and creating the post leaves a claim pointing at nothing.
  const orphaned = await Media.aggregate<{ _id: Types.ObjectId; path: string; post: Types.ObjectId }>([
    { $match: { post: { $ne: null }, createdAt: { $lt: cutoff } } },
    { $lookup: { from: Post.collection.name, localField: 'post', foreignField: '_id', as: 'owner' } },
    { $match: { owner: { $size: 0 } } },
    { $project: { path: 1, post: 1 } },
  ]);

  let count = 0;
  for (const { _id, path, post } of [...unclaimed, ...orphaned]) {
    if (post && (await Post.exists({ _id: post }))) continue;
    const removed = await Media.deleteOne({ _id, post });
    if (!removed.deletedCount) continue;
    await removeUpload(path);
    count += 1;
  }
  return count;
};
