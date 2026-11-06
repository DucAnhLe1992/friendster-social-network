import request from 'supertest';
import { and, count, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { app, auth, registerUser } from './helpers';
import { db } from '../src/database/db';
import { messagesTable } from '../src/database/schema';

const countMessages = async (conversationId: string, content?: string) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(messagesTable)
    .where(and(eq(messagesTable.conversationId, conversationId), content ? eq(messagesTable.content, content) : undefined));
  return total;
};

describe('conversations', () => {
  it('resolves simultaneous starts from both participants to a single conversation', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const attempts = await Promise.all([
      ...Array.from({ length: 6 }, () => request(app).post('/api/conversations').set(auth(alice)).send({ handle: 'bob' })),
      ...Array.from({ length: 6 }, () => request(app).post('/api/conversations').set(auth(bob)).send({ handle: 'alice' })),
    ]);

    expect(attempts.map((r) => r.status)).toEqual(Array(12).fill(200));
    const ids = new Set(attempts.map((r) => r.body.data.conversation._id));
    expect(ids.size).toBe(1);
  });

  it('pages through messages that share a timestamp without skipping any', async () => {
    const alice = await registerUser('alice');
    await registerUser('bob');
    const start = await request(app).post('/api/conversations').set(auth(alice)).send({ handle: 'bob' });
    const conversationId = start.body.data.conversation._id;

    const createdAt = new Date('2025-01-01T00:00:00Z');
    await db.insert(messagesTable).values(
      Array.from({ length: 35 }, (_, i) => ({
        conversationId,
        senderId: alice.id,
        content: `message ${i}`,
        createdAt,
        updatedAt: createdAt,
      }))
    );

    const seen: string[] = [];
    let before: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .query(before ? { before } : {})
        .set(auth(alice));
      expect(res.status).toBe(200);
      const messages = res.body.data.messages as { _id: string }[];
      seen.unshift(...messages.map((m) => m._id));
      if (!res.body.meta.hasMore) break;
      before = messages[0]._id;
    }

    expect(seen).toHaveLength(35);
    expect(new Set(seen).size).toBe(35);
  });

  it('keeps conversations private to their participants', async () => {
    const alice = await registerUser('alice');
    await registerUser('bob');
    const carol = await registerUser('carol');
    const start = await request(app).post('/api/conversations').set(auth(alice)).send({ handle: 'bob' });
    const id = start.body.data.conversation._id;

    const read = await request(app).get(`/api/conversations/${id}/messages`).set(auth(carol));
    const send = await request(app).post(`/api/conversations/${id}/messages`).set(auth(carol)).send({ content: 'hi' });
    expect(read.status).toBe(404);
    expect(send.status).toBe(404);
  });

  it('marks a conversation read and clears its unread count', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const start = await request(app).post('/api/conversations').set(auth(alice)).send({ handle: 'bob' });
    const id = start.body.data.conversation._id;
    const first = await request(app).post(`/api/conversations/${id}/messages`).set(auth(alice)).send({ content: 'hello' });

    const before = await request(app).get('/api/conversations/unread-count').set(auth(bob));
    expect(before.body.data.unreadCount).toBe(1);

    // A message that arrives after the one Bob saw stays unread.
    await request(app).post(`/api/conversations/${id}/messages`).set(auth(alice)).send({ content: 'unseen' });
    await request(app).post(`/api/conversations/${id}/read`).set(auth(bob)).send({ upTo: first.body.data.message._id }).expect(200);
    const after = await request(app).get('/api/conversations/unread-count').set(auth(bob));
    expect(after.body.data.unreadCount).toBe(1);
  });

  it('returns the original message when a send is retried with the same ID', async () => {
    const alice = await registerUser('alice');
    await registerUser('bob');
    const start = await request(app).post('/api/conversations').set(auth(alice)).send({ handle: 'bob' });
    const id = start.body.data.conversation._id;
    const body = { content: 'only once', clientId: '3b241101-e2bb-4255-8caf-4136c566a962' };

    const results = await Promise.all(
      Array.from({ length: 4 }, () => request(app).post(`/api/conversations/${id}/messages`).set(auth(alice)).send(body))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.every((r) => r.status === 201 || r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.data.message._id)).size).toBe(1);
    expect(await countMessages(id, 'only once')).toBe(1);

    const reused = await request(app)
      .post(`/api/conversations/${id}/messages`)
      .set(auth(alice))
      .send({ ...body, content: 'something else' });
    expect(reused.status).toBe(409);
    expect(await countMessages(id)).toBe(1);
  });

  it('always shows the newest message in the list, whatever order writes finished in', async () => {
    const alice = await registerUser('alice');
    await registerUser('bob');
    const start = await request(app).post('/api/conversations').set(auth(alice)).send({ handle: 'bob' });
    const id = start.body.data.conversation._id;
    await request(app).post(`/api/conversations/${id}/messages`).set(auth(alice)).send({ content: 'newer' }).expect(201);
    // An older message whose write lands last must not take over the summary.
    await db
      .insert(messagesTable)
      .values({ conversationId: id, senderId: alice.id, content: 'older', createdAt: new Date(Date.now() - 60_000) });

    const list = await request(app).get('/api/conversations').set(auth(alice));
    expect(list.body.data.conversations).toHaveLength(1);
    expect(list.body.data.conversations[0].lastMessage.content).toBe('newer');
  });

  it('pages forward from a cursor so a reconnecting client can fill a gap in order', async () => {
    const alice = await registerUser('alice');
    await registerUser('bob');
    const start = await request(app).post('/api/conversations').set(auth(alice)).send({ handle: 'bob' });
    const id = start.body.data.conversation._id;
    const seen = await request(app).post(`/api/conversations/${id}/messages`).set(auth(alice)).send({ content: 'seen' });

    const createdAt = new Date(Date.now() + 1000);
    await db
      .insert(messagesTable)
      .values(Array.from({ length: 35 }, (_, i) => ({ conversationId: id, senderId: alice.id, content: `missed ${i}`, createdAt })));

    const caught: string[] = [];
    let after = seen.body.data.message._id as string;
    for (let page = 0; page < 5; page += 1) {
      const res = await request(app).get(`/api/conversations/${id}/messages`).query({ after }).set(auth(alice)).expect(200);
      const messages = res.body.data.messages as { _id: string }[];
      caught.push(...messages.map((m) => m._id));
      if (!res.body.meta.hasMore) break;
      after = messages[messages.length - 1]._id;
    }
    expect(caught).toHaveLength(35);
    expect(new Set(caught).size).toBe(35);
  });
});
