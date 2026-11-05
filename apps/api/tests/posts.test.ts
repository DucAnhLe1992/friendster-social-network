import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, auth, PNG_BYTES, registerUser } from './helpers';
import { removeUpload } from '../src/middleware/upload';
import { Media } from '../src/models';
import { sweepAbandonedUploads } from '../src/services/media';

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
});
