import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, auth, PNG_BYTES, registerUser } from './helpers';
import { removeUpload } from '../src/middleware/upload';

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
});
