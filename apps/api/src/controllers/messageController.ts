import { Response } from 'express';
import { Types } from 'mongoose';
import { Conversation, Message, User } from '../models';
import { createMessageSchema, messagesQuerySchema, startConversationSchema } from '../utils/validation';
import { AUTHOR_FIELDS, publicUser } from '../utils/serializers';
import { getIo } from '../services/notifications';
import { userRoom } from '../realtime';
import { IAuthRequest, IConversation } from '../types';

type ParticipantDoc = Parameters<typeof publicUser>[0];

const summarize = (conversation: IConversation | Record<string, unknown>, viewerId: string) => {
  const c = conversation as unknown as {
    _id: Types.ObjectId;
    participants: ParticipantDoc[];
    lastMessage?: { content: string; sender: Types.ObjectId; createdAt: Date } | null;
    unreadCount?: Record<string, number> | Map<string, number>;
    updatedAt: Date;
  };
  const other = c.participants.find((p) => p._id.toString() !== viewerId) ?? c.participants[0];
  const unread = c.unreadCount instanceof Map ? c.unreadCount.get(viewerId) : c.unreadCount?.[viewerId];

  return {
    _id: c._id.toString(),
    participant: publicUser(other, viewerId),
    lastMessage: c.lastMessage
      ? { content: c.lastMessage.content, sender: c.lastMessage.sender.toString(), createdAt: c.lastMessage.createdAt }
      : null,
    unreadCount: unread ?? 0,
    updatedAt: c.updatedAt,
  };
};

const PARTICIPANT_FIELDS = `${AUTHOR_FIELDS} followers`;

const findOwnConversation = (id: string, userId: Types.ObjectId) =>
  Conversation.findOne({ _id: id, participants: userId });

export const listConversations = async (req: IAuthRequest, res: Response): Promise<void> => {
  const viewerId = req.user!._id.toString();
  const conversations = await Conversation.find({ participants: req.user!._id, lastMessage: { $ne: null } })
    .sort({ updatedAt: -1 })
    .limit(50)
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('lastMessage', 'content sender createdAt')
    .lean();

  res.status(200).json({
    success: true,
    data: { conversations: conversations.map((c) => summarize(c, viewerId)) },
  });
};

export const getUnreadTotal = async (req: IAuthRequest, res: Response): Promise<void> => {
  const viewerId = req.user!._id.toString();
  const [row] = await Conversation.aggregate<{ total: number }>([
    { $match: { participants: req.user!._id } },
    { $group: { _id: null, total: { $sum: { $ifNull: [`$unreadCount.${viewerId}`, 0] } } } },
  ]);
  res.status(200).json({ success: true, data: { unreadCount: row?.total ?? 0 } });
};

export const startConversation = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { handle } = startConversationSchema.parse(req.body);
  const me = req.user!._id;

  const other = await User.findOne({ handle }).select('_id');
  if (!other) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  if (other._id.equals(me)) {
    res.status(400).json({ success: false, error: 'You cannot message yourself' });
    return;
  }

  const participants = [me, other._id].sort((a, b) => a.toString().localeCompare(b.toString()));
  const conversation = await Conversation.findOneAndUpdate(
    { participants: { $all: participants, $size: 2 } },
    { $setOnInsert: { participants } },
    { new: true, upsert: true }
  )
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('lastMessage', 'content sender createdAt')
    .lean();

  res.status(200).json({ success: true, data: { conversation: summarize(conversation!, me.toString()) } });
};

export const getConversation = async (req: IAuthRequest, res: Response): Promise<void> => {
  const conversation = await findOwnConversation(req.params.id, req.user!._id)
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('lastMessage', 'content sender createdAt')
    .lean();

  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }
  res.status(200).json({ success: true, data: { conversation: summarize(conversation, req.user!._id.toString()) } });
};

export const getMessages = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { before, limit } = messagesQuerySchema.parse(req.query);
  const conversation = await findOwnConversation(req.params.id, req.user!._id).select('_id').lean();
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  const query: Record<string, unknown> = { conversation: conversation._id };
  if (before) query.createdAt = { $lt: new Date(before) };

  const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit + 1).lean();
  const hasMore = messages.length > limit;

  res.status(200).json({
    success: true,
    data: { messages: messages.slice(0, limit).reverse() },
    meta: { hasMore },
  });
};

export const sendMessage = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { content } = createMessageSchema.parse(req.body);
  const sender = req.user!._id;

  const conversation = await findOwnConversation(req.params.id, sender);
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  const message = await Message.create({ conversation: conversation._id, sender, content });
  const recipients = conversation.participants.filter((id) => !id.equals(sender));

  const inc: Record<string, number> = {};
  for (const id of recipients) inc[`unreadCount.${id.toString()}`] = 1;
  await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: message._id }, $inc: inc });

  const payload = { conversationId: conversation._id.toString(), message: message.toJSON() };
  const io = getIo(req);
  for (const id of conversation.participants) io.to(userRoom(id.toString())).emit('new_message', payload);

  res.status(201).json({ success: true, data: { message: message.toJSON() } });
};

export const markConversationRead = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!._id;
  const conversation = await Conversation.findOneAndUpdate(
    { _id: req.params.id, participants: me },
    { $set: { [`unreadCount.${me.toString()}`]: 0 } }
  );
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  await Message.updateMany(
    { conversation: conversation._id, sender: { $ne: me }, isRead: false },
    { $set: { isRead: true } }
  );

  const io = getIo(req);
  for (const id of conversation.participants) {
    io.to(userRoom(id.toString())).emit('conversation_read', {
      conversationId: conversation._id.toString(),
      userId: me.toString(),
    });
  }
  res.status(200).json({ success: true });
};
