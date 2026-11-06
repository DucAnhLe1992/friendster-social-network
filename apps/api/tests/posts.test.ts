import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, auth, PNG_BYTES, registerUser } from './helpers';
import { removeUpload } from '../src/middleware/upload';
import { Types } from 'mongoose';
import { Media, Post } from '../src/models';
import { attachClaims, claimForPost, sweepAbandonedUploads } from '../src/services/media';

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

    // createdAt is immutable through Mongoose, so back-date it directly.
    await Media.collection.updateOne({ path: abandoned }, { $set: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
    expect(await sweepAbandonedUploads(86_400_000)).toBe(1);
    await request(app).get(abandoned).expect(404);
    await request(app).get(kept).expect(200);
    await removeUpload(kept);
  });

  it('recovers images claimed by a post that was never saved', async () => {
    const alice = await registerUser('alice');
    const image = await uploadPixel(alice);
    const old = new Date(Date.now() - 2 * 86_400_000);
    await Media.collection.updateOne(
      { path: image },
      { $set: { post: new Types.ObjectId(), state: 'claimed', claimedAt: old, createdAt: old } }
    );

    expect(await sweepAbandonedUploads(86_400_000)).toBe(1);
    await request(app).get(image).expect(404);
  });

  it('does not treat a fresh claim on an old upload as abandoned', async () => {
    const alice = await registerUser('alice');
    const image = await uploadPixel(alice);
    await Media.collection.updateOne({ path: image }, { $set: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
    const postId = new Types.ObjectId();
    expect(await claimForPost(postId, new Types.ObjectId(alice.id), [image])).toBe(true);

    // Sweep runs while the post is still being saved.
    expect(await sweepAbandonedUploads(86_400_000)).toBe(0);
    await Post.create({ _id: postId, author: alice.id, images: [image] });
    expect(await attachClaims(postId, 1)).toBe(true);
    await request(app).get(image).expect(200);
    await removeUpload(image);
  });

  it('never lets cleanup and publishing both win the same image', async () => {
    const alice = await registerUser('alice');
    const owner = new Types.ObjectId(alice.id);
    const expire = (path: string) =>
      Media.collection.updateOne({ path }, { $set: { claimedAt: new Date(Date.now() - 3_600_000) } });

    // Post saved before the sweep looks: the sweep finalizes it instead of deleting.
    const saved = await uploadPixel(alice);
    const savedPost = new Types.ObjectId();
    await claimForPost(savedPost, owner, [saved]);
    await expire(saved);
    await Post.create({ _id: savedPost, author: alice.id, images: [saved] });
    expect(await sweepAbandonedUploads(86_400_000)).toBe(0);
    expect(await attachClaims(savedPost, 1)).toBe(true);
    await request(app).get(saved).expect(200);

    // Sweep removes an expired claim first: publishing must then fail instead of reporting success.
    const lost = await uploadPixel(alice);
    const lostPost = new Types.ObjectId();
    await claimForPost(lostPost, owner, [lost]);
    await expire(lost);
    expect(await sweepAbandonedUploads(86_400_000)).toBe(1);
    await Post.create({ _id: lostPost, author: alice.id, images: [lost] });
    expect(await attachClaims(lostPost, 1)).toBe(false);
    await removeUpload(saved);
  });

  it('never sweeps images that belong to a saved post', async () => {
    const alice = await registerUser('alice');
    const image = await uploadPixel(alice);
    await request(app).post('/api/posts').set(auth(alice)).send({ images: [image] }).expect(201);
    await Media.collection.updateOne({ path: image }, { $set: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });

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
    expect(await Post.countDocuments({ author: alice.id })).toBe(1);
  });

  it('replays an image post retried after its response was lost', async () => {
    const alice = await registerUser('alice');
    const image = await uploadPixel(alice);
    const body = { images: [image], clientId: '0a9b8c7d-6e5f-4a3b-8c1d-0e9f8a7b6c5d' };

    const first = await request(app).post('/api/posts').set(auth(alice)).send(body).expect(201);
    const retry = await request(app).post('/api/posts').set(auth(alice)).send(body).expect(200);
    expect(retry.body.data.post._id).toBe(first.body.data.post._id);
    expect(await Post.countDocuments({ author: alice.id })).toBe(1);
    await removeUpload(image);
  });

  it('keeps posts that are still being published out of every public view', async () => {
    const alice = await registerUser('alice');
    const pending = await Post.create({ author: alice.id, content: 'not yet #secret', status: 'pending' });

    await request(app).get(`/api/posts/${pending._id}`).set(auth(alice)).expect(404);
    const all = await request(app).get('/api/posts').set(auth(alice)).expect(200);
    expect(all.body.data.posts).toHaveLength(0);
    expect(all.body.meta.total).toBe(0);
    const mine = await request(app).get('/api/posts/user/alice').set(auth(alice)).expect(200);
    expect(mine.body.data.posts).toHaveLength(0);
    const trending = await request(app).get('/api/posts/trending').set(auth(alice)).expect(200);
    expect(trending.body.data.topics).toHaveLength(0);
  });

  it('never exposes a post whose publication was interrupted after its image was swept', async () => {
    const alice = await registerUser('alice');
    const owner = new Types.ObjectId(alice.id);
    const image = await uploadPixel(alice);
    const postId = new Types.ObjectId();
    const longAgo = new Date(Date.now() - 3_600_000);

    await claimForPost(postId, owner, [image]);
    await Media.collection.updateOne({ path: image }, { $set: { claimedAt: longAgo } });
    expect(await sweepAbandonedUploads(86_400_000)).toBe(1);
    // The process saved the pending post, then stopped before finalizing or rolling back.
    await Post.collection.insertOne({ _id: postId, author: owner, content: '', images: [image], likes: [], status: 'pending', createdAt: longAgo, updatedAt: longAgo });

    await request(app).get(`/api/posts/${postId}`).set(auth(alice)).expect(404);
    await sweepAbandonedUploads(86_400_000);
    expect(await Post.collection.countDocuments({ _id: postId })).toBe(0);
  });

  it('finishes an interrupted publication whose images are all still in place', async () => {
    const alice = await registerUser('alice');
    const owner = new Types.ObjectId(alice.id);
    const image = await uploadPixel(alice);
    const postId = new Types.ObjectId();
    const longAgo = new Date(Date.now() - 3_600_000);

    await claimForPost(postId, owner, [image]);
    await Post.collection.insertOne({ _id: postId, author: owner, content: '', images: [image], likes: [], status: 'pending', createdAt: longAgo, updatedAt: longAgo });
    await Media.collection.updateOne({ path: image }, { $set: { claimedAt: longAgo } });

    expect(await sweepAbandonedUploads(86_400_000)).toBe(0);
    await request(app).get(`/api/posts/${postId}`).set(auth(alice)).expect(200);
    await request(app).get(image).expect(200);
    await removeUpload(image);
  });
});
