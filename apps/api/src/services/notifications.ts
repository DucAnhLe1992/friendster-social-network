import { Request } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../database/db';
import { commentsTable, notificationsTable, postsTable, usersTable } from '../database/schema';
import { NotificationType } from '../types';
import { authorColumns } from '../utils/serializers';
import { RealtimeServer, userRoom } from '../realtime';


interface NotifyInput {
  recipient: string;
  sender: string;
  type: NotificationType;
  post?: string;
  comment?: string;
}

export const getIo = (req: Request): RealtimeServer => req.app.get('io') as RealtimeServer;

/** The notification shape the web app renders; select from notifications joined to sender, post and comment. */
export const notificationColumns = {
  _id: notificationsTable.id,
  recipient: notificationsTable.recipientId,
  sender: authorColumns(),
  type: notificationsTable.type,
  post: { _id: postsTable.id, content: postsTable.content, images: postsTable.images },
  comment: { _id: commentsTable.id, content: commentsTable.content },
  isRead: notificationsTable.isRead,
  createdAt: notificationsTable.createdAt,
};

export const selectNotifications = () =>
  db
    .select(notificationColumns)
    .from(notificationsTable)
    .innerJoin(usersTable, eq(usersTable.id, notificationsTable.senderId))
    .leftJoin(postsTable, eq(postsTable.id, notificationsTable.postId))
    .leftJoin(commentsTable, eq(commentsTable.id, notificationsTable.commentId));

// Notifications are a side effect: a failure here must not turn an already-saved action into an error response.
export const notify = async (req: Request, input: NotifyInput): Promise<void> => {
  if (input.recipient === input.sender) return;

  try {
    const [created] = await db
      .insert(notificationsTable)
      .values({
        recipientId: input.recipient,
        senderId: input.sender,
        type: input.type,
        postId: input.post ?? null,
        commentId: input.comment ?? null,
      })
      .returning({ id: notificationsTable.id });
    const [notification] = await selectNotifications().where(eq(notificationsTable.id, created.id));
    if (notification) getIo(req).to(userRoom(input.recipient)).emit('new_notification', notification);
  } catch (error) {
    req.log.warn({ err: error }, 'notification delivery failed');
  }
};
