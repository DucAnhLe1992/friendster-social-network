import { Response } from 'express';
import { Notification } from '../models';
import { paginationSchema } from '../utils/validation';
import { AUTHOR_FIELDS } from '../utils/serializers';
import { IApiResponse, IAuthRequest } from '../types';

export const getNotifications = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { page, limit } = paginationSchema.parse(req.query);
  const skip = (page - 1) * limit;
  const recipient = req.user!._id;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ recipient })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', AUTHOR_FIELDS)
      .populate('post', 'content images')
      .populate('comment', 'content')
      .lean(),
    Notification.countDocuments({ recipient }),
    Notification.countDocuments({ recipient, isRead: false }),
  ]);

  const response: IApiResponse = {
    success: true,
    data: { notifications: notifications.filter((n) => n.sender) },
    meta: { page, limit, total, hasMore: skip + notifications.length < total, unreadCount },
  };
  res.status(200).json(response);
};

export const getUnreadCount = async (req: IAuthRequest, res: Response): Promise<void> => {
  const unreadCount = await Notification.countDocuments({ recipient: req.user!._id, isRead: false });
  res.status(200).json({ success: true, data: { unreadCount } });
};

export const markAsRead = async (req: IAuthRequest, res: Response): Promise<void> => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user!._id },
    { $set: { isRead: true } }
  );
  if (!notification) {
    res.status(404).json({ success: false, error: 'Notification not found' });
    return;
  }
  res.status(200).json({ success: true });
};

export const markAllAsRead = async (req: IAuthRequest, res: Response): Promise<void> => {
  await Notification.updateMany({ recipient: req.user!._id, isRead: false }, { $set: { isRead: true } });
  res.status(200).json({ success: true });
};

export const deleteNotification = async (req: IAuthRequest, res: Response): Promise<void> => {
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user!._id });
  if (!notification) {
    res.status(404).json({ success: false, error: 'Notification not found' });
    return;
  }
  res.status(200).json({ success: true });
};
