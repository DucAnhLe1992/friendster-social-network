import { Response } from 'express';
import { User, Notification, Post, Comment } from '../models';
import { updateProfileSchema, escapeRegex } from '../utils/validation';
import { AUTHOR_FIELDS, publicUser, selfUser } from '../utils/serializers';
import { removeUpload, uploadedPath } from '../middleware/upload';
import { notify } from '../services/notifications';
import { IAuthRequest } from '../types';

const findByHandle = (handle: string) => User.findOne({ handle: handle.toLowerCase() });

export const getUserByHandle = async (req: IAuthRequest, res: Response): Promise<void> => {
  const user = await findByHandle(req.params.handle).lean();
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  const postCount = await Post.countDocuments({ author: user._id });
  res.status(200).json({
    success: true,
    data: { user: { ...publicUser(user, req.user?._id.toString()), postCount } },
  });
};

export const updateProfile = async (req: IAuthRequest, res: Response): Promise<void> => {
  const data = updateProfileSchema.parse(req.body);

  const user = await User.findByIdAndUpdate(req.user!._id, { $set: data }, { new: true, runValidators: true });
  res.status(200).json({ success: true, data: { user: selfUser(user!) }, message: 'Profile updated' });
};

const saveImage = (field: 'avatar' | 'coverImage', folder: 'avatars' | 'covers') =>
  async (req: IAuthRequest, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    const newPath = uploadedPath(folder, req.file.filename);
    let previous;
    try {
      previous = await User.findByIdAndUpdate(req.user!._id, { $set: { [field]: newPath } });
    } catch (error) {
      await removeUpload(newPath);
      throw error;
    }
    if (!previous) {
      await removeUpload(newPath);
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    await removeUpload(previous?.[field]);
    const user = await User.findById(req.user!._id);
    res.status(200).json({ success: true, data: { user: selfUser(user!) } });
  };

export const uploadAvatar = saveImage('avatar', 'avatars');
export const uploadCover = saveImage('coverImage', 'covers');

export const followUser = async (req: IAuthRequest, res: Response): Promise<void> => {
  const currentUserId = req.user!._id;
  const target = await findByHandle(req.params.handle).select('_id followers');

  if (!target) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  if (target._id.equals(currentUserId)) {
    res.status(400).json({ success: false, error: 'You cannot follow yourself' });
    return;
  }

  const result = await User.updateOne(
    { _id: target._id, followers: { $ne: currentUserId } },
    { $push: { followers: currentUserId } }
  );

  // Always applied (idempotently) so retrying after a partial failure repairs the follower's side.
  await User.updateOne({ _id: currentUserId }, { $addToSet: { following: target._id } });
  if (result.modifiedCount > 0) {
    await notify(req, { recipient: target._id, sender: currentUserId, type: 'follow' });
  }

  res.status(200).json({
    success: true,
    data: { isFollowing: true, followerCount: target.followers.length + result.modifiedCount },
  });
};

export const unfollowUser = async (req: IAuthRequest, res: Response): Promise<void> => {
  const currentUserId = req.user!._id;
  const target = await User.findOneAndUpdate(
    { handle: req.params.handle.toLowerCase() },
    { $pull: { followers: currentUserId } },
    { new: true }
  ).select('_id followers');

  if (!target) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  await Promise.all([
    User.updateOne({ _id: currentUserId }, { $pull: { following: target._id } }),
    Notification.deleteOne({ recipient: target._id, sender: currentUserId, type: 'follow' }),
  ]);

  res.status(200).json({ success: true, data: { isFollowing: false, followerCount: target.followers.length } });
};

const listConnections = (field: 'followers' | 'following') =>
  async (req: IAuthRequest, res: Response): Promise<void> => {
    const user = await findByHandle(req.params.handle)
      .populate({ path: field, select: `${AUTHOR_FIELDS} bio followers following`, options: { limit: 100 } })
      .lean();

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const viewerId = req.user?._id.toString();
    const people = (user[field] as unknown as Parameters<typeof publicUser>[0][]).map((u) => publicUser(u, viewerId));
    res.status(200).json({ success: true, data: { users: people } });
  };

export const getFollowers = listConnections('followers');
export const getFollowing = listConnections('following');

export const searchUsers = async (req: IAuthRequest, res: Response): Promise<void> => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 50) : '';
  if (!q) {
    res.status(400).json({ success: false, error: 'Search query required' });
    return;
  }

  const pattern = new RegExp(escapeRegex(q), 'i');
  const users = await User.find({ $or: [{ displayName: pattern }, { handle: pattern }] })
    .select(`${AUTHOR_FIELDS} bio followers following`)
    .limit(20)
    .lean();

  const viewerId = req.user?._id.toString();
  res.status(200).json({ success: true, data: { users: users.map((u) => publicUser(u, viewerId)) } });
};

export const getSuggestions = async (req: IAuthRequest, res: Response): Promise<void> => {
  const exclude = [...req.user!.following, req.user!._id];
  const users = await User.aggregate([
    { $match: { _id: { $nin: exclude } } },
    { $addFields: { followerTotal: { $size: '$followers' } } },
    { $sort: { followerTotal: -1, createdAt: -1 } },
    { $limit: 5 },
    { $project: { handle: 1, displayName: 1, avatar: 1, isVerified: 1, bio: 1, followers: 1, following: 1 } },
  ]);

  res.status(200).json({ success: true, data: { users: users.map((u) => publicUser(u)) } });
};

export const getUserReplies = async (req: IAuthRequest, res: Response): Promise<void> => {
  const user = await findByHandle(req.params.handle).select('_id').lean();
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  const comments = await Comment.find({ author: user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('author', AUTHOR_FIELDS)
    .populate({ path: 'post', select: 'content author', populate: { path: 'author', select: 'handle displayName' } })
    .lean();

  const replies = comments
    .filter((c) => c.post)
    .map(({ likes, ...rest }) => ({ ...rest, likeCount: likes.length }));

  res.status(200).json({ success: true, data: { replies } });
};
