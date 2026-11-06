import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { app, auth, PNG_BYTES, registerUser } from './helpers';
import { removeUpload, UPLOADS_ROOT } from '../src/middleware/upload';
import { count, eq } from 'drizzle-orm';
import { db } from '../src/database/db';
import { mediaTable, postsTable } from '../src/database/schema';
import { sweepAbandonedUploads } from '../src/services/media';

const backdateUpload = (image: string) =>
  db.update(mediaTable).set({ createdAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(mediaTable.path, image));

const countPosts = async (authorId: string) => {
  const [{ total }] = await db.select({ total: count() }).from(postsTable).where(eq(postsTable.authorId, authorId));
  return total;
};

const uploadPixel = async (user: Parameters<typeof auth>[0]) => {
  const res = await request(app)
    .post('/api/posts/images')
    .set(auth(user))
    .attach('images', PNG_BYTES, { filename: 'pixel.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  return (res.body.data.images as string[])[0];
};

describe('posts and uploads', () => {
  it('creates an image-only post from an uploaded image', async () => {
    const alice = await registerUser('alice');
    const upload = await request(app)
      .post('/api/posts/images')
      .set(auth(alice))
      .attach('images', PNG_BYTES, { filename: 'pixel.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    const [image] = upload.body.data.images as string[];

    const post = await request(app).post('/api/posts').set(auth(alice)).send({ images: [image] });
    expect(post.status).toBe(201);
    expect(post.body.data.post.images).toEqual([image]);
    expect(post.body.data.post.content).toBe('');

    await removeUpload(image);
  });

  it('rejects files whose bytes are not the claimed image type', async () => {
    const alice = await registerUser('alice');
    const res = await request(app)
      .post('/api/posts/images')
      .set(auth(alice))
      .attach('images', Buffer.from('definitely not an image'), { filename: 'fake.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('removes uploaded files when recording their ownership fails', async () => {
    const alice = await registerUser('alice');
    const directory = path.join(UPLOADS_ROOT, 'posts');
    const before = await fs.readdir(directory);
    const insert = vi.spyOn(db, 'insert').mockImplementationOnce(() => {
      throw new Error('database unavailable');
    });

    try {
      const response = await request(app)
        .post('/api/posts/images')
        .set(auth(alice))
        .attach('images', PNG_BYTES, { filename: 'pixel.png', contentType: 'image/png' });
      expect(response.status).toBe(500);
    } finally {
      insert.mockRestore();
    }

    expect(await fs.readdir(directory)).toEqual(before);
  });

  it("rejects missing images and other people's uploads", async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const upload = await request(app)
      .post('/api/posts/images')
      .set(auth(alice))
      .attach('images', PNG_BYTES, { filename: 'pixel.png', contentType: 'image/png' });
    const [aliceImage] = upload.body.data.images as string[];

    const stolen = await request(app).post('/api/posts').set(auth(bob)).send({ images: [aliceImage] });
    const missing = await request(app)
      .post('/api/posts')
      .set(auth(bob))
      .send({ images: [`/uploads/posts/${bob.id}-123-abc.png`] });
    expect(stolen.status).toBe(400);
    expect(missing.status).toBe(400);

    await removeUpload(aliceImage);
  });

  it('only lets the author edit or delete a post', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const created = await request(app).post('/api/posts').set(auth(alice)).send({ content: 'hello world' });
    const id = created.body.data.post._id;

    await request(app).put(`/api/posts/${id}`).set(auth(bob)).send({ content: 'hacked' }).expect(404);
    await request(app).delete(`/api/posts/${id}`).set(auth(bob)).expect(404);
    await request(app).put(`/api/posts/${id}`).set(auth(alice)).send({ content: 'edited' }).expect(200);
  });

  it('rejects a file that only has an image signature but does not decode', async () => {
    const alice = await registerUser('alice');
    const res = await request(app)
      .post('/api/posts/images')
      .set(auth(alice))
      .attach('images', PNG_BYTES.subarray(0, 8), { filename: 'header.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('lets an uploaded image belong to only one post, so deleting it never breaks another', async () => {
    const alice = await registerUser('alice');
    const image = await uploadPixel(alice);

    const first = await request(app).post('/api/posts').set(auth(alice)).send({ images: [image] });
    const second = await request(app).post('/api/posts').set(auth(alice)).send({ images: [image] });
    expect(first.status).toBe(201);
    expect(second.status).toBe(400);

    await request(app).get(image).expect(200);
    await request(app).delete(`/api/posts/${first.body.data.post._id}`).set(auth(alice)).expect(200);
    await request(app).get(image).expect(404);
  });

  it('releases images when post creation is rejected and sweeps abandoned uploads', async () => {
    const alice = await registerUser('alice');
    const kept = await uploadPixel(alice);
    const abandoned = await uploadPixel(alice);

    // A request mixing a valid upload with an invalid one must not leave the valid one claimed.
    await request(app).post('/api/posts').set(auth(alice)).send({ images: [kept, '/uploads/posts/missing.png'] }).expect(400);
    await request(app).post('/api/posts').set(auth(alice)).send({ images: [kept] }).expect(201);

    await backdateUpload(abandoned);
    expect(await sweepAbandonedUploads(86_400_000)).toBe(1);
    await request(app).get(abandoned).expect(404);
    await request(app).get(kept).expect(200);
    await removeUpload(kept);
  });

  it('fails to publish an image that cleanup already removed, without saving the post', async () => {
    const alice = await registerUser('alice');
    const image = await uploadPixel(alice);
    await backdateUpload(image);

    expect(await sweepAbandonedUploads(86_400_000)).toBe(1);
    await request(app).post('/api/posts').set(auth(alice)).send({ images: [image] }).expect(400);
    expect(await countPosts(alice.id)).toBe(0);
  });

  it('never lets cleanup and publishing both win the same image', async () => {
    const alice = await registerUser('alice');
    const image = await uploadPixel(alice);
    await backdateUpload(image);

    const [published, swept] = await Promise.all([
      request(app).post('/api/posts').set(auth(alice)).send({ images: [image] }),
      sweepAbandonedUploads(86_400_000),
    ]);

    if (published.status === 201) {
      expect(swept).toBe(0);
      await request(app).get(image).expect(200);
      await removeUpload(image);
    } else {
      expect(published.status).toBe(400);
      expect(swept).toBe(1);
      expect(await countPosts(alice.id)).toBe(0);
    }
  });

  it('never sweeps images that belong to a saved post', async () => {
    const alice = await registerUser('alice');
    const image = await uploadPixel(alice);
    await request(app).post('/api/posts').set(auth(alice)).send({ images: [image] }).expect(201);
    await backdateUpload(image);

    expect(await sweepAbandonedUploads(86_400_000)).toBe(0);
    await request(app).get(image).expect(200);
    await removeUpload(image);
  });

  it('turns retries with the same post ID into one post, and rejects a reused ID with different content', async () => {
    const alice = await registerUser('alice');
    const body = { content: 'hello once', clientId: '6f1c7a52-3d4b-4e8f-9a1b-2c3d4e5f6a7b' };

    const results = await Promise.all(
      Array.from({ length: 4 }, () => request(app).post('/api/posts').set(auth(alice)).send(body))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.every((r) => r.status === 201 || r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.data.post._id)).size).toBe(1);
    expect(results[0].body.data.post.author.handle).toBe('alice');
    expect(results[0].body.data.post.status).toBeUndefined();

    const conflict = await request(app).post('/api/posts').set(auth(alice)).send({ ...body, content: 'other' });
    expect(conflict.status).toBe(409);
    expect(await countPosts(alice.id)).toBe(1);
  });

  it('replays an image post retried after its response was lost', async () => {
    const alice = await registerUser('alice');
    const image = await uploadPixel(alice);
    const body = { images: [image], clientId: '0a9b8c7d-6e5f-4a3b-8c1d-0e9f8a7b6c5d' };

    const first = await request(app).post('/api/posts').set(auth(alice)).send(body).expect(201);
    const retry = await request(app).post('/api/posts').set(auth(alice)).send(body).expect(200);
    expect(retry.body.data.post._id).toBe(first.body.data.post._id);
    expect(await countPosts(alice.id)).toBe(1);
    await removeUpload(image);
  });

  it('returns the same public post shape from every route', async () => {
    const alice = await registerUser('alice');
    const clientId = '0b5c3f0e-2f1a-4c4e-9a54-0f6d2f3b7e11';
    const body = { content: 'shape check #shape', clientId };
    const created = await request(app).post('/api/posts').set(auth(alice)).send(body).expect(201);
    const id = created.body.data.post._id;

    const postKeys = [
      '_id', 'author', 'commentsCount', 'content', 'createdAt', 'images', 'isEdited', 'isLiked', 'likeCount',
      'sharesCount', 'updatedAt',
    ];
    const authorKeys = ['_id', 'avatar', 'displayName', 'handle', 'isVerified'];
    const check = (post: Record<string, unknown>) => {
      expect(Object.keys(post).sort()).toEqual(postKeys);
      expect(Object.keys(post.author as object).sort()).toEqual(authorKeys);
    };

    const replay = await request(app).post('/api/posts').set(auth(alice)).send(body).expect(200);
    const detail = await request(app).get(`/api/posts/${id}`).set(auth(alice)).expect(200);
    const feed = await request(app).get('/api/posts/feed').set(auth(alice)).expect(200);
    const search = await request(app).get('/api/posts/search').query({ q: 'shape' }).set(auth(alice)).expect(200);
    const updated = await request(app).put(`/api/posts/${id}`).set(auth(alice)).send({ content: 'edited' }).expect(200);

    for (const post of [created.body.data.post, replay.body.data.post, detail.body.data.post, updated.body.data.post]) {
      check(post);
    }
    for (const list of [feed.body.data.posts, search.body.data.posts]) {
      expect(list).toHaveLength(1);
      check(list[0]);
    }
  });
});
