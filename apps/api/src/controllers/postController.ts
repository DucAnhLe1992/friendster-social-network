import { Request, Response } from 'express';
import { FilterQuery, Types } from 'mongoose';
import { Post, User, Comment, Notification } from '../models';
import { createPostSchema, updatePostSchema, paginationSchema, profileTabSchema } from '../utils/validation';
import { AUTHOR_FIELDS, withLikeStatus } from '../utils/serializers';
import { uploadedPath } from '../middleware/upload';
import { claimForPost, deletePostMedia, recordUploads, releaseClaims } from '../services/media';
import { notify } from '../services/notifications';
import { IApiResponse, IAuthRequest, IPost } from '../types';

const listPosts = async (req: IAuthRequest, res: Response, query: FilterQuery<IPost>): Promise<void> => {
  const { page, limit } = paginationSchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [posts, total] = await Promise.all([
    Post.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('author', AUTHOR_FIELDS).lean(),
    Post.countDocuments(query),
  ]);

  const viewerId = req.user?._id.toString();
  const response: IApiResponse = {
    success: true,
    data: { posts: posts.map((post) => withLikeStatus(post, viewerId)) },
    meta: { page, limit, total, hasMore: skip + posts.length < total },
  };
  res.status(200).json(response);
};

export const getFeed = async (req: IAuthRequest, res: Response): Promise<void> => {
  const authors = [...req.user!.following, req.user!._id];
  await listPosts(req, res, { author: { $in: authors } });
};

export const getAllPosts = async (req: IAuthRequest, res: Response): Promise<void> => {
  await listPosts(req, res, {});
};

export const getUserPosts = async (req: IAuthRequest, res: Response): Promise<void> => {
  const tab = profileTabSchema.parse(req.query.tab);
  const user = await User.findOne({ handle: req.params.handle.toLowerCase() }).select('_id').lean();
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  const queries: Record<typeof tab, FilterQuery<IPost>> = {
    posts: { author: user._id },
    media: { author: user._id, 'images.0': { $exists: true } },
    likes: { likes: user._id },
  };
  await listPosts(req, res, queries[tab]);
};

export const getPost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const post = await Post.findById(req.params.id).populate('author', AUTHOR_FIELDS).lean();
  if (!post) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }
  res.status(200).json({ success: true, data: { post: withLikeStatus(post, req.user?._id.toString()) } });
};

export const uploadPostImages = async (req: IAuthRequest, res: Response): Promise<void> => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ success: false, error: 'No images uploaded' });
    return;
  }
  const images = files.map((file) => uploadedPath('posts', file.filename));
  await recordUploads(req.user!._id, images);
  res.status(201).json({ success: true, data: { images } });
};

export const createPost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const data = createPostSchema.parse(req.body);
  const postId = new Types.ObjectId();
  if (!(await claimForPost(postId, req.user!._id, data.images))) {
    res.status(400).json({ success: false, error: 'One or more images are invalid. Please upload them again.' });
    return;
  }

  let post;
  try {
    post = await Post.create({ ...data, _id: postId, author: req.user!._id });
  } catch (error) {
    await releaseClaims(postId);
    throw error;
  }
  await post.populate('author', AUTHOR_FIELDS);

  res.status(201).json({
    success: true,
    data: { post: withLikeStatus(post.toObject(), req.user!._id.toString()) },
    message: 'Post created successfully',
  });
};

export const updatePost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { content } = updatePostSchema.parse(req.body);

  const post = await Post.findOneAndUpdate(
    { _id: req.params.id, author: req.user!._id },
    { $set: { content, isEdited: true } },
    { new: true }
  )
    .populate('author', AUTHOR_FIELDS)
    .lean();

  if (!post) {
    res.status(404).json({ success: false, error: 'Post not found or unauthorized' });
    return;
  }

  res.status(200).json({
    success: true,
    data: { post: withLikeStatus(post, req.user!._id.toString()) },
    message: 'Post updated successfully',
  });
};

export const deletePost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const post = await Post.findOneAndDelete({ _id: req.params.id, author: req.user!._id });
  if (!post) {
    res.status(404).json({ success: false, error: 'Post not found or unauthorized' });
    return;
  }

  await Promise.all([
    Comment.deleteMany({ post: post._id }),
    Notification.deleteMany({ post: post._id }),
    deletePostMedia(post._id, post.images),
  ]);
  res.status(200).json({ success: true, message: 'Post deleted successfully' });
};

export const likePost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const userId = req.user!._id;
  const before = await Post.findByIdAndUpdate(req.params.id, { $addToSet: { likes: userId } });
  if (!before) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }

  const alreadyLiked = before.likes.some((id) => id.equals(userId));
  if (!alreadyLiked) {
    await notify(req, { recipient: before.author as Types.ObjectId, sender: userId, type: 'like', post: before._id });
  }

  res.status(200).json({
    success: true,
    data: { likeCount: before.likes.length + (alreadyLiked ? 0 : 1), isLiked: true },
  });
};

export const unlikePost = async (req: IAuthRequest, res: Response): Promise<void> => {
  const userId = req.user!._id;
  const post = await Post.findByIdAndUpdate(req.params.id, { $pull: { likes: userId } }, { new: true });
  if (!post) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }

  await Notification.deleteOne({ recipient: post.author, sender: userId, type: 'like', post: post._id });
  res.status(200).json({ success: true, data: { likeCount: post.likes.length, isLiked: false } });
};

export const getTrending = async (_req: Request, res: Response): Promise<void> => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const posts = await Post.find({ createdAt: { $gte: since }, content: /#\w/ })
    .select('content')
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

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
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    res.status(400).json({ success: false, error: 'Search query required' });
    return;
  }
  await listPosts(req, res, { $text: { $search: q } });
};
