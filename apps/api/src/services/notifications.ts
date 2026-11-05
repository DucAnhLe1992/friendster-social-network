import { Request } from 'express';
import { Types } from 'mongoose';
import { Notification } from '../models';
import { NotificationType } from '../types';
import { RealtimeServer, userRoom } from '../realtime';

interface NotifyInput {
  recipient: Types.ObjectId | string;
  sender: Types.ObjectId | string;
  type: NotificationType;
  post?: Types.ObjectId | string;
  comment?: Types.ObjectId | string;
}

export const getIo = (req: Request): RealtimeServer => req.app.get('io') as RealtimeServer;

export const notify = async (req: Request, input: NotifyInput): Promise<void> => {
  if (input.recipient.toString() === input.sender.toString()) return;

  const notification = await Notification.create(input);
  await notification.populate([
    { path: 'sender', select: 'handle displayName avatar isVerified' },
    { path: 'post', select: 'content images' },
    { path: 'comment', select: 'content' },
  ]);

  getIo(req).to(userRoom(input.recipient.toString())).emit('new_notification', notification.toJSON());
};
