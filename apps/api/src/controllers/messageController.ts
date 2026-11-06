import { Response } from 'express';
import { and, asc, desc, eq, gt, inArray, isNotNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../database/db';
import { conversationParticipantsTable, conversationsTable, messagesTable, usersTable } from '../database/schema';
import { createMessageSchema, markReadSchema, messagesQuerySchema, startConversationSchema } from '../utils/validation';
import { publicUserColumns } from '../utils/serializers';
import { getIo } from '../services/notifications';
import { userRoom } from '../realtime';
import { isDuplicateKey } from '../middleware/errorHandler';
import { IAuthRequest } from '../types';

const messageColumns = {
  _id: messagesTable.id,
  conversation: messagesTable.conversationId,
  sender: messagesTable.senderId,
  content: messagesTable.content,
  isRead: messagesTable.isRead,
  createdAt: messagesTable.createdAt,
};

const myConversationIds = (me: string) =>
  db
    .select({ id: conversationParticipantsTable.conversationId })
    .from(conversationParticipantsTable)
    .where(eq(conversationParticipantsTable.userId, me));

const unreadIn = (me: string, conversationId: typeof conversationsTable.id | string) =>
  and(eq(messagesTable.conversationId, conversationId), ne(messagesTable.senderId, me), eq(messagesTable.isRead, false));

// Summaries are computed from the messages themselves, so unread counts and the latest message can never drift.
const selectSummaries = (me: string) => {
  const latest = db
    .selectDistinctOn([messagesTable.conversationId], {
      conversationId: messagesTable.conversationId,
      id: messagesTable.id,
      content: messagesTable.content,
      senderId: messagesTable.senderId,
      createdAt: messagesTable.createdAt,
    })
    .from(messagesTable)
    .where(inArray(messagesTable.conversationId, myConversationIds(me)))
    .orderBy(messagesTable.conversationId, desc(messagesTable.createdAt), desc(messagesTable.id))
    .as('latest');
  const other = alias(conversationParticipantsTable, 'other');

  const query = db
    .select({
      _id: conversationsTable.id,
      participant: publicUserColumns(me),
      lastContent: latest.content,
      lastSender: latest.senderId,
      lastAt: latest.createdAt,
      updatedAt: conversationsTable.updatedAt,
      unreadCount: sql<number>`(select count(*)::int from ${messagesTable} where ${unreadIn(me, conversationsTable.id)})`,
    })
    .from(conversationsTable)
    .innerJoin(other, and(eq(other.conversationId, conversationsTable.id), ne(other.userId, me)))
    .innerJoin(usersTable, eq(usersTable.id, other.userId))
    .leftJoin(latest, eq(latest.conversationId, conversationsTable.id))
    .$dynamic();

  return { latest, query };
};

type SummaryRow = Awaited<ReturnType<typeof selectSummaries>['query']>[number];

const toSummary = (row: SummaryRow) => ({
  _id: row._id,
  participant: row.participant,
  lastMessage:
    row.lastAt && row.lastSender !== null && row.lastContent !== null
      ? { content: row.lastContent, sender: row.lastSender, createdAt: row.lastAt }
      : null,
  unreadCount: row.unreadCount,
  updatedAt: row.lastAt ?? row.updatedAt,
});

const describeOne = async (conversationId: string, me: string) => {
  const { query } = selectSummaries(me);
  const [row] = await query
    .where(and(eq(conversationsTable.id, conversationId), inArray(conversationsTable.id, myConversationIds(me))))
    .limit(1);
  return row ? toSummary(row) : null;
};

const findOwnConversation = async (id: string, me: string) => {
  const [row] = await db
    .select({ id: conversationParticipantsTable.conversationId })
    .from(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, id), eq(conversationParticipantsTable.userId, me)))
    .limit(1);
  return row ?? null;
};

const participantsOf = async (conversationId: string) =>
  (
    await db
      .select({ userId: conversationParticipantsTable.userId })
      .from(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.conversationId, conversationId))
  ).map((p) => p.userId);

const findOrCreateDirectConversation = (a: string, b: string): Promise<string> => {
  const pair = [a, b].sort((x, y) => x.localeCompare(y));
  const pairKey = pair.join(':');

  return db.transaction(async (tx) => {
    // A concurrent creator makes this wait for its commit, after which the lookup below sees its row.
    const [created] = await tx
      .insert(conversationsTable)
      .values({ pairKey })
      .onConflictDoNothing({ target: conversationsTable.pairKey })
      .returning({ id: conversationsTable.id });
    if (created) {
      await tx.insert(conversationParticipantsTable).values(pair.map((userId) => ({ conversationId: created.id, userId })));
      return created.id;
    }
    const [existing] = await tx
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.pairKey, pairKey))
      .limit(1);
    return existing.id;
  });
};

export const listConversations = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!.id;
  const { latest, query } = selectSummaries(me);
  const rows = await query
    .where(and(inArray(conversationsTable.id, myConversationIds(me)), isNotNull(latest.id)))
    .orderBy(desc(latest.createdAt), desc(latest.id))
    .limit(50);

  res.status(200).json({ success: true, data: { conversations: rows.map(toSummary) } });
};

export const getUnreadTotal = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!.id;
  const [{ unreadCount }] = await db
    .select({ unreadCount: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(
      and(
        inArray(messagesTable.conversationId, myConversationIds(me)),
        ne(messagesTable.senderId, me),
        eq(messagesTable.isRead, false)
      )
    );
  res.status(200).json({ success: true, data: { unreadCount } });
};

export const startConversation = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { handle } = startConversationSchema.parse(req.body);
  const me = req.user!.id;

  const [other] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.handle, handle)).limit(1);
  if (!other) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  if (other.id === me) {
    res.status(400).json({ success: false, error: 'You cannot message yourself' });
    return;
  }

  const conversationId = await findOrCreateDirectConversation(me, other.id);
  res.status(200).json({ success: true, data: { conversation: await describeOne(conversationId, me) } });
};

export const getConversation = async (req: IAuthRequest, res: Response): Promise<void> => {
  const conversation = await describeOne(req.params.id, req.user!.id);
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }
  res.status(200).json({ success: true, data: { conversation } });
};

const findMessageIn = async (conversationId: string, id: string) => {
  const [row] = await db
    .select({ id: messagesTable.id, createdAt: messagesTable.createdAt })
    .from(messagesTable)
    .where(and(eq(messagesTable.id, id), eq(messagesTable.conversationId, conversationId)))
    .limit(1);
  return row ?? null;
};

export const getMessages = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { before, after, limit } = messagesQuerySchema.parse(req.query);
  const conversation = await findOwnConversation(req.params.id, req.user!.id);
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  const conditions = [eq(messagesTable.conversationId, conversation.id)];
  const cursorId = before ?? after;
  if (cursorId) {
    const cursor = await findMessageIn(conversation.id, cursorId);
    if (!cursor) {
      res.status(400).json({ success: false, error: 'Invalid cursor' });
      return;
    }
    const op = before ? lt : gt;
    conditions.push(
      or(
        op(messagesTable.createdAt, cursor.createdAt),
        and(eq(messagesTable.createdAt, cursor.createdAt), op(messagesTable.id, cursor.id))
      )!
    );
  }

  // `after` pages forward (oldest first) so a reconnecting client can fill a gap in order.
  const order = after ? asc : desc;
  const messages = await db
    .select(messageColumns)
    .from(messagesTable)
    .where(and(...conditions))
    .orderBy(order(messagesTable.createdAt), order(messagesTable.id))
    .limit(limit + 1);
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
  const sender = req.user!.id;

  const conversation = await findOwnConversation(req.params.id, sender);
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  // Retrying with the same client ID returns the original message instead of storing a duplicate.
  const findExisting = async () => {
    if (!clientId) return null;
    const [row] = await db
      .select(messageColumns)
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, conversation.id),
          eq(messagesTable.senderId, sender),
          eq(messagesTable.clientId, clientId)
        )
      )
      .limit(1);
    return row ?? null;
  };

  let message = await findExisting();
  let created = false;
  if (!message) {
    try {
      [message] = await db
        .insert(messagesTable)
        .values({ conversationId: conversation.id, senderId: sender, content, clientId: clientId ?? null })
        .returning(messageColumns);
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

  const payload = { conversationId: conversation.id, message };
  const io = getIo(req);
  for (const id of await participantsOf(conversation.id)) io.to(userRoom(id)).emit('new_message', payload);

  res.status(created ? 201 : 200).json({ success: true, data: { message } });
};

export const markConversationRead = async (req: IAuthRequest, res: Response): Promise<void> => {
  const me = req.user!.id;
  const conversation = await findOwnConversation(req.params.id, me);
  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  // Only messages up to the last one the reader actually saw are marked; anything newer stays unread.
  const { upTo } = markReadSchema.parse(req.body ?? {});
  const watermark = await findMessageIn(conversation.id, upTo);
  if (!watermark) {
    res.status(400).json({ success: false, error: 'Invalid message' });
    return;
  }
  await db
    .update(messagesTable)
    .set({ isRead: true })
    .where(
      and(
        unreadIn(me, conversation.id),
        or(
          lt(messagesTable.createdAt, watermark.createdAt),
          and(eq(messagesTable.createdAt, watermark.createdAt), lte(messagesTable.id, watermark.id))
        )
      )
    );

  const io = getIo(req);
  for (const id of await participantsOf(conversation.id)) {
    io.to(userRoom(id)).emit('conversation_read', { conversationId: conversation.id, userId: me });
  }
  res.status(200).json({ success: true });
};
