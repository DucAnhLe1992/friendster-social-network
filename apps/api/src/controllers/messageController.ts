import { Response } from 'express';
import { PipelineStage, Types } from 'mongoose';
import { Conversation, Message, User } from '../models';
import { createMessageSchema, markReadSchema, messagesQuerySchema, startConversationSchema } from '../utils/validation';
import { AUTHOR_FIELDS, publicUser } from '../utils/serializers';
import { getIo } from '../services/notifications';
import { userRoom } from '../realtime';
import { isDuplicateKey } from '../middleware/errorHandler';
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

type LatestMessage = { content: string; sender: Types.ObjectId; createdAt: Date };

// The newest message is always read from the messages themselves, so a summary can never be stale or move backward.
const latestMessages = async (conversationIds: Types.ObjectId[], limit?: number) => {
  const pipeline: PipelineStage[] = [
    { $match: { conversation: { $in: conversationIds } } },
    { $sort: { conversation: 1, createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: '$conversation',
        content: { $first: '$content' },
        sender: { $first: '$sender' },
        createdAt: { $first: '$createdAt' },
        messageId: { $first: '$_id' },
      },
    },
    { $sort: { createdAt: -1, messageId: -1 } },
  ];
  if (limit) pipeline.push({ $limit: limit });
  const rows = await Message.aggregate<LatestMessage & { _id: Types.ObjectId }>(pipeline);
  return rows;
};

const summarize = (
  conversation: IConversation | Record<string, unknown>,
  viewerId: string,
  unread = 0,
  last: LatestMessage | null = null
) => {
  const c = conversation as unknown as {
    _id: Types.ObjectId;
    participants: ParticipantDoc[];
    updatedAt: Date;
  };
  const other = c.participants.find((p) => p._id.toString() !== viewerId) ?? c.participants[0];

  return {
    _id: c._id.toString(),
    participant: publicUser(other, viewerId),
    lastMessage: last ? { content: last.content, sender: last.sender.toString(), createdAt: last.createdAt } : null,
    unreadCount: unread,
    updatedAt: last?.createdAt ?? c.updatedAt,
  };
};

const describeOne = async (conversation: IConversation | Record<string, unknown>, viewer: Types.ObjectId) => {
  const id = (conversation as { _id: Types.ObjectId })._id;
  const [counts, [last]] = await Promise.all([unreadMap(viewer, [id]), latestMessages([id])]);
  return summarize(conversation, viewer.toString(), counts.get(id.toString()), last ?? null);
};

const PARTICIPANT_FIELDS = `${AUTHOR_FIELDS} followers`;

const findOwnConversation = (id: string, userId: Types.ObjectId) =>
  Conversation.findOne({ _id: id, participants: userId });


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

export const listConversations = async (req: IAuthRequest, res: Response): Promise<void> => {
  const viewerId = req.user!._id.toString();
  const ids = await Conversation.find({ participants: req.user!._id }).distinct('_id');
  const latest = await latestMessages(ids, 50);
  const shownIds = latest.map((row) => row._id);
  const [docs, counts] = await Promise.all([
    Conversation.find({ _id: { $in: shownIds } }).populate('participants', PARTICIPANT_FIELDS).lean(),
    unreadMap(req.user!._id, shownIds),
  ]);
  const byId = new Map(docs.map((c) => [c._id.toString(), c]));
  const conversations = latest.flatMap((row) => {
    const c = byId.get(row._id.toString());
    return c ? [summarize(c, viewerId, counts.get(row._id.toString()), row)] : [];
  });

  res.status(200).json({ success: true, data: { conversations } });
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
  const conversation = await Conversation.findById(conversationId).populate('participants', PARTICIPANT_FIELDS).lean();

  res.status(200).json({ success: true, data: { conversation: await describeOne(conversation!, me) } });
};

export const getConversation = async (req: IAuthRequest, res: Response): Promise<void> => {
  const conversation = await findOwnConversation(req.params.id, req.user!._id)
    .populate('participants', PARTICIPANT_FIELDS)
    .lean();

  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }
  res.status(200).json({ success: true, data: { conversation: await describeOne(conversation, req.user!._id) } });
};

export const getMessages = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { before, after, limit } = messagesQuerySchema.parse(req.query);
  const conversation = await findOwnConversation(req.params.id, req.user!._id).select('_id').lean();
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  const query: Record<string, unknown> = { conversation: conversation._id };
  const cursorId = before ?? after;
  if (cursorId) {
    const cursor = await Message.findOne({ _id: cursorId, conversation: conversation._id }).select('createdAt').lean();
    if (!cursor) {
      res.status(400).json({ success: false, error: 'Invalid cursor' });
      return;
    }
    const op = before ? '$lt' : '$gt';
    query.$or = [
      { createdAt: { [op]: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { [op]: cursor._id } },
    ];
  }

  // `after` pages forward (oldest first) so a reconnecting client can fill a gap in order.
  const direction = after ? 1 : -1;
  const messages = await Message.find(query)
    .sort({ createdAt: direction, _id: direction })
    .limit(limit + 1)
    .lean();
  const hasMore = messages.length > limit;
  const page = messages.slice(0, limit);

  res.status(200).json({
    success: true,
    data: { messages: after ? page : page.reverse() },
    meta: { hasMore },
  });
};

export const sendMessage = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { content, clientId } = createMessageSchema.parse(req.body);
  const sender = req.user!._id;

  const conversation = await findOwnConversation(req.params.id, sender);
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  // Retrying with the same client ID returns the original message instead of storing a duplicate.
  const findExisting = () =>
    clientId ? Message.findOne({ conversation: conversation._id, sender, clientId }) : Promise.resolve(null);
  let message = await findExisting();
  let created = false;
  if (!message) {
    try {
      message = await Message.create({ conversation: conversation._id, sender, content, ...(clientId && { clientId }) });
      created = true;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      message = await findExisting();
      if (!message) throw error;
    }
  }
  if (!created && message.content !== content) {
    res.status(409).json({ success: false, error: 'This message ID was already used for a different message' });
    return;
  }

  const payload = { conversationId: conversation._id.toString(), message: message.toJSON() };
  const io = getIo(req);
  for (const id of conversation.participants) io.to(userRoom(id.toString())).emit('new_message', payload);

  res.status(created ? 201 : 200).json({ success: true, data: { message: message.toJSON() } });
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
