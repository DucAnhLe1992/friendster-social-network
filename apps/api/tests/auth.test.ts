import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { app, registerUser } from './helpers';
import { count, eq, isNotNull } from 'drizzle-orm';
import { db } from '../src/database/db';
import { refreshSessionsTable as sessions } from '../src/database/schema';
import { deleteExpiredSessions } from '../src/services/sessions';

const backdateRotations = () =>
  db.update(sessions).set({ rotatedAt: new Date(Date.now() - 60_000) }).where(isNotNull(sessions.rotatedAt));

const refresh = (refreshToken: string) => request(app).post('/api/auth/refresh').send({ refreshToken });

const waitForSql = async (client: PoolClient, query: string, values: number[] = []): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await client.query(query, values);
    if (result.rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the PostgreSQL concurrency barrier');
};

describe('sessions', () => {
  it('returns the same successor for a concurrent refresh retry', async () => {
    const alice = await registerUser('alice');

    const [first, retry] = await Promise.all([refresh(alice.refreshToken), refresh(alice.refreshToken)]);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body.data.tokens).toEqual(first.body.data.tokens);
    expect(first.body.data.tokens.refreshToken).not.toBe(alice.refreshToken);
    const [{ total }] = await db.select({ total: count() }).from(sessions).where(eq(sessions.userId, alice.id));
    expect(total).toBe(2);

    const second = await refresh(first.body.data.tokens.refreshToken as string);
    expect(second.status).toBe(200);
  });

  it('rejects a rotated refresh token replayed after its grace period', async () => {
    const alice = await registerUser('alice');
    await refresh(alice.refreshToken).expect(200);
    await backdateRotations();
    expect((await refresh(alice.refreshToken)).status).toBe(401);
  });

  it('deletes expired refresh sessions and keeps active sessions', async () => {
    const alice = await registerUser('alice');
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'Password123!' })
      .expect(200);
    const [session] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, alice.id)).limit(1);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, session.id));

    expect(await deleteExpiredSessions()).toBe(1);
    const [{ total }] = await db.select({ total: count() }).from(sessions).where(eq(sessions.userId, alice.id));
    expect(total).toBe(1);
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

    await backdateRotations();
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

  it.skipIf(!process.env.DATABASE_URL_TEST)('logout revokes a successor when rotation is paused before commit', async () => {
    const alice = await registerUser('alice');
    const testPool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
    const client = await testPool.connect();
    const lockClass = 83127;
    const lockObject = 29411;
    let lockHeld = false;
    let rotation: Promise<request.Response> | undefined;
    let logout: Promise<request.Response> | undefined;

    try {
      await client.query('select pg_advisory_lock($1, $2)', [lockClass, lockObject]);
      lockHeld = true;
      await client.query('DROP TRIGGER IF EXISTS test_pause_refresh_insert ON refresh_sessions');
      await client.query('DROP FUNCTION IF EXISTS test_pause_refresh_insert_fn()');
      await client.query(`
        CREATE FUNCTION test_pause_refresh_insert_fn() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(${lockClass}, ${lockObject});
          RETURN NEW;
        END;
        $$
      `);
      await client.query(`
        CREATE TRIGGER test_pause_refresh_insert
        AFTER INSERT ON refresh_sessions
        FOR EACH ROW EXECUTE FUNCTION test_pause_refresh_insert_fn()
      `);

      rotation = request(app).post('/api/auth/refresh').send({ refreshToken: alice.refreshToken }).then((response) => response);
      await waitForSql(
        client,
        `SELECT EXISTS (
          SELECT 1 FROM pg_locks
          WHERE locktype = 'advisory' AND classid = $1::oid AND objid = $2::oid
            AND objsubid = 2 AND NOT granted
        ) AS waiting`,
        [lockClass, lockObject]
      );

      logout = request(app).post('/api/auth/logout').send({ refreshToken: alice.refreshToken }).then((response) => response);
      await waitForSql(
        client,
        `SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND query ILIKE '%session_families%'
            AND query ILIKE '%FOR UPDATE%'
        ) AS waiting`
      );

      await client.query('select pg_advisory_unlock($1, $2)', [lockClass, lockObject]);
      lockHeld = false;
      const [rotationResponse, logoutResponse] = await Promise.all([rotation, logout]);
      expect(rotationResponse.status).toBe(200);
      expect(logoutResponse.status).toBe(200);
      expect((await refresh(rotationResponse.body.data.tokens.refreshToken as string)).status).toBe(401);
    } finally {
      if (lockHeld) await client.query('select pg_advisory_unlock($1, $2)', [lockClass, lockObject]).catch(() => undefined);
      await Promise.all([rotation?.catch(() => undefined), logout?.catch(() => undefined)]);
      await client.query('DROP TRIGGER IF EXISTS test_pause_refresh_insert ON refresh_sessions').catch(() => undefined);
      await client.query('DROP FUNCTION IF EXISTS test_pause_refresh_insert_fn()').catch(() => undefined);
      client.release();
      await testPool.end();
    }
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
