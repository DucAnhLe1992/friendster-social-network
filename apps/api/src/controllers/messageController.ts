import { Response } from 'express';
import { Types } from 'mongoose';
import { Conversation, Message, User } from '../models';
import { createMessageSchema, markReadSchema, messagesQuerySchema, startConversationSchema } from '../utils/validation';
import { AUTHOR_FIELDS, publicUser } from '../utils/serializers';
import { getIo } from '../services/notifications';
import { userRoom } from '../realtime';
import { IAuthRequest, IConversation } from '../types';

type ParticipantDoc = Parameters<typeof publicUser>[0];

// Unread state lives only on the messages themselves, so concurrent sends and reads cannot drift apart.
const unreadFor = (viewer: Types.ObjectId, conversationIds: Types.ObjectId[]) =>
  Message.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { conversation: { $in: conversationIds }, sender: { $ne: viewer }, isRead: false } },
    { $group: { _id: '$conversation', count: { $sum: 1 } } },
  ]);

const unreadMap = async (viewer: Types.ObjectId, conversationIds: Types.ObjectId[]) =>
  new Map((await unreadFor(viewer, conversationIds)).map((row) => [row._id.toString(), row.count]));

const summarize = (conversation: IConversation | Record<string, unknown>, viewerId: string, unread = 0) => {
  const c = conversation as unknown as {
    _id: Types.ObjectId;
    participants: ParticipantDoc[];
    lastMessage?: { content: string; sender: Types.ObjectId; createdAt: Date } | null;
    updatedAt: Date;
  };
  const other = c.participants.find((p) => p._id.toString() !== viewerId) ?? c.participants[0];

  return {
    _id: c._id.toString(),
    participant: publicUser(other, viewerId),
    lastMessage: c.lastMessage
      ? { content: c.lastMessage.content, sender: c.lastMessage.sender.toString(), createdAt: c.lastMessage.createdAt }
      : null,
    unreadCount: unread,
    updatedAt: c.updatedAt,
  };
};

const PARTICIPANT_FIELDS = `${AUTHOR_FIELDS} followers`;

const findOwnConversation = (id: string, userId: Types.ObjectId) =>
  Conversation.findOne({ _id: id, participants: userId });

const isDuplicateKey = (error: unknown) => (error as { code?: number })?.code === 11000;

const findOrCreateDirectConversation = async (a: Types.ObjectId, b: Types.ObjectId): Promise<Types.ObjectId> => {
  const participants = [a, b].sort((x, y) => x.toString().localeCompare(y.toString()));
  const pairKey = participants.map(String).join(':');

  const existing = await Conversation.findOne({ pairKey }).select('_id').lean();
  if (existing) return existing._id;

  const legacy = await Conversation.findOne({ pairKey: { $exists: false }, participants: { $all: participants, $size: 2 } })
    .select('_id')
    .lean();
  if (legacy) {
    try {
      await Conversation.updateOne({ _id: legacy._id }, { $set: { pairKey } });
      return legacy._id;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // Another request keyed this pair first; always hand back the canonical conversation.
      const winner = await Conversation.findOne({ pairKey }).select('_id').lean();
      return winner!._id;
    }
  }

  try {
    const created = await Conversation.findOneAndUpdate(
      { pairKey },
      { $setOnInsert: { pairKey, participants } },
      { new: true, upsert: true }
    )
      .select('_id')
      .lean();
    return created!._id;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const winner = await Conversation.findOne({ pairKey }).select('_id').lean();
    return winner!._id;
  }
};

// Sending writes the message and then the conversation's `lastMessage`; if that second write failed, repair it here
// so a conversation that has messages is never hidden from the list.
const repairLastMessages = async (viewer: Types.ObjectId): Promise<void> => {
  const empty = await Conversation.find({ participants: viewer, lastMessage: null }).distinct('_id');
  if (empty.length === 0) return;
  const latest = await Message.aggregate<{ _id: Types.ObjectId; message: Types.ObjectId; at: Date }>([
    { $match: { conversation: { $in: empty } } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $group: { _id: '$conversation', message: { $first: '$_id' }, at: { $first: '$createdAt' } } },
  ]);
  await Promise.all(
    latest.map((row) =>
      Conversation.updateOne({ _id: row._id, lastMessage: null }, { $set: { lastMessage: row.message, updatedAt: row.at } })
    )
  );
};

export const listConversations = async (req: IAuthRequest, res: Response): Promise<void> => {
  const viewerId = req.user!._id.toString();
  await repairLastMessages(req.user!._id);
  const conversations = await Conversation.find({ participants: req.user!._id, lastMessage: { $ne: null } })
    .sort({ updatedAt: -1 })
    .limit(50)
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('lastMessage', 'content sender createdAt')
    .lean();
  const counts = await unreadMap(req.user!._id, conversations.map((c) => c._id));

  res.status(200).json({
    success: true,
    data: { conversations: conversations.map((c) => summarize(c, viewerId, counts.get(c._id.toString()))) },
  });
};

export const getUnreadTotal = async (req: IAuthRequest, res: Response): Promise<void> => {
  const ids = await Conversation.find({ participants: req.user!._id }).distinct('_id');
  const rows = await unreadFor(req.user!._id, ids);
  res.status(200).json({ success: true, data: { unreadCount: rows.reduce((sum, row) => sum + row.count, 0) } });
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

  const conversationId = await findOrCreateDirectConversation(me, other._id);
  const conversation = await Conversation.findById(conversationId)
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('lastMessage', 'content sender createdAt')
    .lean();

  const counts = await unreadMap(me, [conversationId]);
  res.status(200).json({
    success: true,
    data: { conversation: summarize(conversation!, me.toString(), counts.get(conversationId.toString())) },
  });
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
  const counts = await unreadMap(req.user!._id, [conversation._id]);
  res.status(200).json({
    success: true,
    data: { conversation: summarize(conversation, req.user!._id.toString(), counts.get(conversation._id.toString())) },
  });
};

export const getMessages = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { before, limit } = messagesQuerySchema.parse(req.query);
  const conversation = await findOwnConversation(req.params.id, req.user!._id).select('_id').lean();
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  const query: Record<string, unknown> = { conversation: conversation._id };
  if (before) {
    const cursor = await Message.findOne({ _id: before, conversation: conversation._id }).select('createdAt').lean();
    if (!cursor) {
      res.status(400).json({ success: false, error: 'Invalid cursor' });
      return;
    }
    query.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
    ];
  }

  const messages = await Message.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
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
  await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: message._id } });

  const payload = { conversationId: conversation._id.toString(), message: message.toJSON() };
  const io = getIo(req);
  for (const id of conversation.participants) io.to(userRoom(id.toString())).emit('new_message', payload);

  res.status(201).json({ success: true, data: { message: message.toJSON() } });
};

export const markConversationRead = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!._id;
  const conversation = await findOwnConversation(req.params.id, me).select('participants').lean();
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  // Only messages up to the last one the reader actually saw are marked; anything newer stays unread.
  const { upTo } = markReadSchema.parse(req.body ?? {});
  const watermark = await Message.findOne({ _id: upTo, conversation: conversation._id }).select('createdAt').lean();
  if (!watermark) {
    res.status(400).json({ success: false, error: 'Invalid message' });
    return;
  }
  await Message.updateMany(
    {
      conversation: conversation._id,
      sender: { $ne: me },
      isRead: false,
      $or: [{ createdAt: { $lt: watermark.createdAt } }, { createdAt: watermark.createdAt, _id: { $lte: watermark._id } }],
    },
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
