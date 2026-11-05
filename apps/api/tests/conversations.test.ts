import request from 'supertest';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { app, auth, registerUser } from './helpers';
import { Message } from '../src/models';

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
    await Message.insertMany(
      Array.from({ length: 35 }, (_, i) => ({
        conversation: new mongoose.Types.ObjectId(conversationId),
        sender: new mongoose.Types.ObjectId(alice.id),
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
});
