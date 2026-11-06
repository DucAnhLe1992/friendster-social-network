import { Response } from 'express';
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '../database/db';
import { notificationsTable } from '../database/schema';
import { paginationSchema } from '../utils/validation';
import { selectNotifications } from '../services/notifications';
import { IApiResponse, IAuthRequest } from '../types';

const unreadCountFor = async (recipient: string) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.recipientId, recipient), eq(notificationsTable.isRead, false)));
  return total;
};

const own = (req: IAuthRequest) =>
  and(eq(notificationsTable.id, req.params.id), eq(notificationsTable.recipientId, req.user!.id));

export const getNotifications = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { page, limit } = paginationSchema.parse(req.query);
  const offset = (page - 1) * limit;
  const recipient = req.user!.id;
  const mine = eq(notificationsTable.recipientId, recipient);

  const [notifications, [{ total }], unreadCount] = await Promise.all([
    selectNotifications()
      .where(mine)
      .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(notificationsTable).where(mine),
    unreadCountFor(recipient),
  ]);

  const response: IApiResponse = {
    success: true,
    data: { notifications },
    meta: { page, limit, total, hasMore: offset + notifications.length < total, unreadCount },
  };
  res.status(200).json(response);
};

export const getUnreadCount = async (req: IAuthRequest, res: Response): Promise<void> => {
  res.status(200).json({ success: true, data: { unreadCount: await unreadCountFor(req.user!.id) } });
};

export const markAsRead = async (req: IAuthRequest, res: Response): Promise<void> => {
  const updated = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(own(req))
    .returning({ id: notificationsTable.id });
  if (updated.length === 0) {
    res.status(404).json({ success: false, error: 'Notification not found' });
    return;
  }
  res.status(200).json({ success: true });
};

export const markAllAsRead = async (req: IAuthRequest, res: Response): Promise<void> => {
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.recipientId, req.user!.id), eq(notificationsTable.isRead, false)));
  res.status(200).json({ success: true });
};

export const deleteNotification = async (req: IAuthRequest, res: Response): Promise<void> => {
  const removed = await db.delete(notificationsTable).where(own(req)).returning({ id: notificationsTable.id });
  if (removed.length === 0) {
    res.status(404).json({ success: false, error: 'Notification not found' });
    return;
  }
  res.status(200).json({ success: true });
};
