import { Response } from 'express';
import { Types } from 'mongoose';
import { Comment, Post, Notification } from '../models';
import { createCommentSchema, updateCommentSchema, paginationSchema } from '../utils/validation';
import { AUTHOR_FIELDS, withLikeStatus } from '../utils/serializers';
import { notify } from '../services/notifications';
import { IApiResponse, IAuthRequest } from '../types';

const replyCounts = async (ids: Types.ObjectId[]): Promise<Map<string, number>> => {
  const rows = await Comment.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { parentComment: { $in: ids } } },
    { $group: { _id: '$parentComment', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.count]));
};

const listComments = async (
  req: IAuthRequest,
  res: Response,
  query: Record<string, unknown>,
  sort: 1 | -1,
  key: 'comments' | 'replies'
): Promise<void> => {
  const { page, limit } = paginationSchema.parse(req.query);
  const skip = (page - 1) * limit;

  const [comments, total] = await Promise.all([
    Comment.find(query).sort({ createdAt: sort }).skip(skip).limit(limit).populate('author', AUTHOR_FIELDS).lean(),
    Comment.countDocuments(query),
  ]);

  const counts = key === 'comments' ? await replyCounts(comments.map((c) => c._id)) : new Map<string, number>();
  const viewerId = req.user?._id.toString();

  const response: IApiResponse = {
    success: true,
    data: {
      [key]: comments.map((c) => ({ ...withLikeStatus(c, viewerId), replyCount: counts.get(c._id.toString()) ?? 0 })),
    },
    meta: { page, limit, total, hasMore: skip + comments.length < total },
  };
  res.status(200).json(response);
};

export const getComments = async (req: IAuthRequest, res: Response): Promise<void> => {
  await listComments(req, res, { post: req.params.id, parentComment: null }, -1, 'comments');
};

export const getReplies = async (req: IAuthRequest, res: Response): Promise<void> => {
  await listComments(req, res, { post: req.params.id, parentComment: req.params.commentId }, 1, 'replies');
};

export const createComment = async (req: IAuthRequest, res: Response): Promise<void> => {
  const data = createCommentSchema.parse(req.body);
  const userId = req.user!._id;

  const post = await Post.findById(req.params.id).select('author');
  if (!post) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }

  let parent = null;
  if (data.parentComment) {
    parent = await Comment.findOne({ _id: data.parentComment, post: post._id }).select('author parentComment');
    if (!parent) {
      res.status(404).json({ success: false, error: 'Comment not found' });
      return;
    }
  }

  // Replies to replies attach to the top-level thread
  const parentId = parent ? parent.parentComment ?? parent._id : null;

  const comment = await Comment.create({
    content: data.content,
    post: post._id,
    author: userId,
    parentComment: parentId,
  });
  await Post.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });
  await comment.populate('author', AUTHOR_FIELDS);

  await notify(req, { recipient: post.author as Types.ObjectId, sender: userId, type: 'comment', post: post._id, comment: comment._id });
  if (parent && !(parent.author as Types.ObjectId).equals(post.author as Types.ObjectId)) {
    await notify(req, { recipient: parent.author as Types.ObjectId, sender: userId, type: 'reply', post: post._id, comment: comment._id });
  }

  res.status(201).json({
    success: true,
    data: { comment: { ...withLikeStatus(comment.toObject(), userId.toString()), replyCount: 0 } },
  });
};

export const updateComment = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { content } = updateCommentSchema.parse(req.body);

  const comment = await Comment.findOneAndUpdate(
    { _id: req.params.commentId, post: req.params.id, author: req.user!._id },
    { $set: { content, isEdited: true } },
    { new: true }
  )
    .populate('author', AUTHOR_FIELDS)
    .lean();

  if (!comment) {
    res.status(404).json({ success: false, error: 'Comment not found or unauthorized' });
    return;
  }

  res.status(200).json({ success: true, data: { comment: withLikeStatus(comment, req.user!._id.toString()) } });
};

export const deleteComment = async (req: IAuthRequest, res: Response): Promise<void> => {
  const comment = await Comment.findOneAndDelete({
    _id: req.params.commentId,
    post: req.params.id,
    author: req.user!._id,
  });

  if (!comment) {
    res.status(404).json({ success: false, error: 'Comment not found or unauthorized' });
    return;
  }

  const removed = [comment._id];
  if (!comment.parentComment) {
    const replies = await Comment.find({ parentComment: comment._id }).select('_id').lean();
    removed.push(...replies.map((r) => r._id));
    await Comment.deleteMany({ parentComment: comment._id });
  }

  await Promise.all([
    Post.updateOne({ _id: comment.post }, { $inc: { commentsCount: -removed.length } }),
    Notification.deleteMany({ comment: { $in: removed } }),
  ]);

  res.status(200).json({ success: true, data: { removed: removed.length } });
};

export const likeComment = async (req: IAuthRequest, res: Response): Promise<void> => {
  const comment = await Comment.findOneAndUpdate(
    { _id: req.params.commentId, post: req.params.id },
    { $addToSet: { likes: req.user!._id } },
    { new: true }
  );
  if (!comment) {
    res.status(404).json({ success: false, error: 'Comment not found' });
    return;
  }
  res.status(200).json({ success: true, data: { likeCount: comment.likes.length, isLiked: true } });
};

export const unlikeComment = async (req: IAuthRequest, res: Response): Promise<void> => {
  const comment = await Comment.findOneAndUpdate(
    { _id: req.params.commentId, post: req.params.id },
    { $pull: { likes: req.user!._id } },
    { new: true }
  );
  if (!comment) {
    res.status(404).json({ success: false, error: 'Comment not found' });
    return;
  }
  res.status(200).json({ success: true, data: { likeCount: comment.likes.length, isLiked: false } });
};
