import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, registerUser } from './helpers';
import { RefreshSession } from '../src/models';

const refresh = (refreshToken: string) => request(app).post('/api/auth/refresh').send({ refreshToken });

describe('sessions', () => {
  it('rotates refresh tokens so each one works only once', async () => {
    const alice = await registerUser('alice');

    const first = await refresh(alice.refreshToken);
    expect(first.status).toBe(200);
    const next = first.body.data.tokens.refreshToken as string;
    expect(next).not.toBe(alice.refreshToken);

    const replay = await refresh(alice.refreshToken);
    expect(replay.status).toBe(401);

    const second = await refresh(next);
    expect(second.status).toBe(200);
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
