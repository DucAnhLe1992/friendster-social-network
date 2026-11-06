import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, registerUser } from './helpers';
import { RefreshSession } from '../src/models';

const refresh = (refreshToken: string) => request(app).post('/api/auth/refresh').send({ refreshToken });

describe('sessions', () => {
  it('returns the same successor for a concurrent refresh retry', async () => {
    const alice = await registerUser('alice');

    const [first, retry] = await Promise.all([refresh(alice.refreshToken), refresh(alice.refreshToken)]);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body.data.tokens).toEqual(first.body.data.tokens);
    expect(first.body.data.tokens.refreshToken).not.toBe(alice.refreshToken);
    expect(await RefreshSession.countDocuments({ user: alice.id })).toBe(2);

    const second = await refresh(first.body.data.tokens.refreshToken as string);
    expect(second.status).toBe(200);
  });

  it('rejects a rotated refresh token replayed after its grace period', async () => {
    const alice = await registerUser('alice');
    await refresh(alice.refreshToken).expect(200);
    await RefreshSession.updateOne({ rotatedAt: { $ne: null } }, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });
    expect((await refresh(alice.refreshToken)).status).toBe(401);
  });

  it('rejects registration passwords shorter than twelve characters', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@example.com', password: 'Short123!', handle: 'shorty', displayName: 'Short' });
    expect(response.status).toBe(400);
  });

  it('revokes every session when a rotated token is replayed later', async () => {
    const alice = await registerUser('alice');
    const first = await refresh(alice.refreshToken);
    const next = first.body.data.tokens.refreshToken as string;

    await RefreshSession.updateMany({ rotatedAt: { $ne: null } }, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });
    expect((await refresh(alice.refreshToken)).status).toBe(401);
    expect((await refresh(next)).status).toBe(401);
  });

  it('revokes the refresh token on logout', async () => {
    const alice = await registerUser('alice');
    await request(app).post('/api/auth/logout').send({ refreshToken: alice.refreshToken }).expect(200);
    expect((await refresh(alice.refreshToken)).status).toBe(401);
  });

  it('logout with an already-rotated token also revokes its successor', async () => {
    const alice = await registerUser('alice');
    const rotated = await refresh(alice.refreshToken);
    const successor = rotated.body.data.tokens.refreshToken as string;

    await request(app).post('/api/auth/logout').send({ refreshToken: alice.refreshToken }).expect(200);
    expect((await refresh(successor)).status).toBe(401);
  });

  it('logout leaves the same account signed in on other devices', async () => {
    const alice = await registerUser('alice');
    const login = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'Password123!' });
    const otherDevice = login.body.data.tokens.refreshToken as string;

    await request(app).post('/api/auth/logout').send({ refreshToken: alice.refreshToken }).expect(200);
    expect((await refresh(otherDevice)).status).toBe(200);
  });

  it('does not let profile updates change privileged fields', async () => {
    const alice = await registerUser('alice');
    const res = await request(app)
      .put('/api/users/profile')
      .set({ Authorization: `Bearer ${alice.accessToken}` })
      .send({ displayName: 'Alice', role: 'admin', isVerified: true, email: 'evil@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).not.toBe('admin');
    expect(res.body.data.user.isVerified).toBe(false);
    expect(res.body.data.user.email).toBe('alice@example.com');
  });
});
