import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { db } from '../src/database/db';
import { postsTable } from '../src/database/schema';
import { app, auth, registerUser } from './helpers';

describe('post pagination', () => {
  it('pages with a cursor through posts that share a timestamp, without gaps or duplicates', async () => {
    const alice = await registerUser('alice');
    const at = new Date('2026-01-01T12:00:00.000Z');
    await db.insert(postsTable).values(
      Array.from({ length: 7 }, (_, i) => ({ authorId: alice.id, content: `post ${i}`, createdAt: at, updatedAt: at }))
    );

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const res = await request(app)
        .get('/api/posts')
        .query({ limit: 3, ...(cursor && { cursor }) })
        .expect(200);
      seen.push(...res.body.data.posts.map((p: { _id: string }) => p._id));
      if (!res.body.meta.hasMore) {
        expect(res.body.meta.nextCursor).toBeNull();
        break;
      }
      cursor = res.body.meta.nextCursor;
    }

    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(seen).toEqual([...seen].sort().reverse());
  });

  it('does not shift later pages when new posts arrive', async () => {
    const alice = await registerUser('alice');
    for (let i = 0; i < 4; i += 1) {
      await request(app).post('/api/posts').set(auth(alice)).send({ content: `old ${i}` }).expect(201);
    }
    const first = await request(app).get('/api/posts').query({ limit: 2 }).expect(200);
    await request(app).post('/api/posts').set(auth(alice)).send({ content: 'brand new' }).expect(201);
    const second = await request(app).get('/api/posts').query({ limit: 2, cursor: first.body.meta.nextCursor }).expect(200);

    const contents = [...first.body.data.posts, ...second.body.data.posts].map((p: { content: string }) => p.content);
    expect(contents).toEqual(['old 3', 'old 2', 'old 1', 'old 0']);
  });

  it('rejects a tampered cursor', async () => {
    const res = await request(app).get('/api/posts').query({ cursor: 'not-a-cursor' }).expect(400);
    expect(res.body.error).toBe('Invalid cursor');
  });
});

describe('platform behaviour', () => {
  it('tags responses with a request ID and reuses a well-formed upstream one', async () => {
    const generated = await request(app).get('/health').expect(200);
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const forwarded = await request(app).get('/health').set('X-Request-Id', 'edge-abc12345').expect(200);
    expect(forwarded.headers['x-request-id']).toBe('edge-abc12345');

    const unsafe = await request(app).get('/health').set('X-Request-Id', '<script>').expect(200);
    expect(unsafe.headers['x-request-id']).not.toBe('<script>');
  });

  it('includes the request ID in error bodies and never echoes internals', async () => {
    const malformed = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(malformed.body).toMatchObject({ success: false, error: 'Invalid request' });
    expect(malformed.body.requestId).toBe(malformed.headers['x-request-id']);

    const missing = await request(app).get('/api/does-not-exist?token=secret').expect(404);
    expect(JSON.stringify(missing.body)).not.toContain('secret');
  });

  it('reports readiness from the database', async () => {
    const res = await request(app).get('/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'READY', database: true });
  });

  it('serves trending hashtags from recent posts', async () => {
    const alice = await registerUser('alice');
    await request(app).post('/api/posts').set(auth(alice)).send({ content: 'loving #TypeScript and #postgres' }).expect(201);
    await request(app).post('/api/posts').set(auth(alice)).send({ content: 'more #typescript' }).expect(201);
    const res = await request(app).get('/api/posts/trending').expect(200);
    expect(res.body.data.topics[0]).toEqual({ tag: '#typescript', count: 2 });
  });
});

describe('notifications', () => {
  it('lists, counts, marks read and deletes notifications for their recipient only', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const post = await request(app).post('/api/posts').set(auth(alice)).send({ content: 'hi' }).expect(201);
    await request(app).post(`/api/posts/${post.body.data.post._id}/like`).set(auth(bob)).expect(200);

    const unread = await request(app).get('/api/notifications/unread-count').set(auth(alice)).expect(200);
    expect(unread.body.data.unreadCount).toBe(1);

    const list = await request(app).get('/api/notifications').set(auth(alice)).expect(200);
    const [notification] = list.body.data.notifications;
    expect(notification).toMatchObject({ type: 'like', isRead: false });

    await request(app).put(`/api/notifications/${notification._id}/read`).set(auth(bob)).expect(404);
    await request(app).delete(`/api/notifications/${notification._id}`).set(auth(bob)).expect(404);

    await request(app).put('/api/notifications/read-all').set(auth(alice)).expect(200);
    const after = await request(app).get('/api/notifications/unread-count').set(auth(alice)).expect(200);
    expect(after.body.data.unreadCount).toBe(0);

    await request(app).delete(`/api/notifications/${notification._id}`).set(auth(alice)).expect(200);
    const empty = await request(app).get('/api/notifications').set(auth(alice)).expect(200);
    expect(empty.body.data.notifications).toHaveLength(0);
  });

  it('removes the like notification when the like is withdrawn', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const post = await request(app).post('/api/posts').set(auth(alice)).send({ content: 'hi' }).expect(201);
    const likeUrl = `/api/posts/${post.body.data.post._id}/like`;
    await request(app).post(likeUrl).set(auth(bob)).expect(200);
    const unliked = await request(app).delete(likeUrl).set(auth(bob)).expect(200);
    expect(unliked.body.data).toEqual({ likeCount: 0, isLiked: false });

    const list = await request(app).get('/api/notifications').set(auth(alice)).expect(200);
    expect(list.body.data.notifications).toHaveLength(0);
  });
});
