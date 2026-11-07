import { and, asc, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../database/db';
import { refreshSessionsTable, sessionFamiliesTable, usersTable } from '../database/schema';
import { generateTokens, tokenExpiry, verifyRefreshToken } from '../utils/jwt';
import { AuthUser, ITokens } from '../types';

// Concurrent refreshes from several tabs may legitimately present the same token for a moment.
const REUSE_GRACE_MS = 30 * 1000;

type SessionUser = Pick<AuthUser, 'id' | 'handle' | 'role'>;
type Session = typeof refreshSessionsTable.$inferSelect;

const tokensFor = (user: SessionUser, jti: string, issuedAt: number) =>
  generateTokens({ userId: user.id, handle: user.handle, role: user.role }, jti, issuedAt);

const issue = async (user: SessionUser): Promise<ITokens> => {
  const family = crypto.randomUUID();
  const jti = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokens = tokensFor(user, jti, issuedAt);
  const expiresAt = tokenExpiry(tokens.refreshToken);
  await db.transaction(async (tx) => {
    await tx.insert(sessionFamiliesTable).values({ id: family, userId: user.id, expiresAt });
    await tx.insert(refreshSessionsTable).values({ userId: user.id, jti, family, issuedAt, expiresAt });
  });
  return tokens;
};

export const startSession = (user: SessionUser): Promise<ITokens> => issue(user);

const decode = (refreshToken: string) => {
  try {
    const payload = verifyRefreshToken(refreshToken);
    return payload.jti ? { userId: payload.userId, jti: payload.jti } : null;
  } catch {
    return null;
  }
};

const findSession = async (jti: string, userId: string): Promise<Session | null> => {
  const [row] = await db
    .select()
    .from(refreshSessionsTable)
    .where(and(eq(refreshSessionsTable.jti, jti), eq(refreshSessionsTable.userId, userId)))
    .limit(1);
  return row ?? null;
};

const findUser = async (id: string): Promise<SessionUser | null> => {
  const [row] = await db
    .select({ id: usersTable.id, handle: usersTable.handle, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return row ?? null;
};

const revokeAll = (userId: string) =>
  db
    .update(sessionFamiliesTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessionFamiliesTable.userId, userId), isNull(sessionFamiliesTable.revokedAt)));

const withinGrace = (session: Session, now: Date) =>
  Boolean(session.rotatedAt && now.getTime() - session.rotatedAt.getTime() < REUSE_GRACE_MS);

export const deleteExpiredSessions = async (): Promise<number> => {
  const now = new Date();
  const batchSize = 1000;
  let deleted = 0;

  while (true) {
    const expired = db
      .select({ id: refreshSessionsTable.id })
      .from(refreshSessionsTable)
      .where(lt(refreshSessionsTable.expiresAt, now))
      .orderBy(asc(refreshSessionsTable.expiresAt))
      .limit(batchSize);
    const removed = await db
      .delete(refreshSessionsTable)
      .where(inArray(refreshSessionsTable.id, expired))
      .returning({ id: refreshSessionsTable.id });
    deleted += removed.length;
    if (removed.length < batchSize) break;
  }

  while (true) {
    const expiredFamilies = db
      .select({ id: sessionFamiliesTable.id })
      .from(sessionFamiliesTable)
      .where(lt(sessionFamiliesTable.expiresAt, now))
      .orderBy(asc(sessionFamiliesTable.expiresAt))
      .limit(batchSize);
    const removed = await db
      .delete(sessionFamiliesTable)
      .where(inArray(sessionFamiliesTable.id, expiredFamilies))
      .returning({ id: sessionFamiliesTable.id });
    if (removed.length < batchSize) return deleted;
  }
};

// A tab that lost the rotation race within the grace window receives the winner's tokens instead of being signed out.
const recoverConcurrentRotation = async (session: Session, now: Date) => {
  if (!withinGrace(session, now) || !session.successorJti) return null;
  const [family] = await db
    .select({ revokedAt: sessionFamiliesTable.revokedAt })
    .from(sessionFamiliesTable)
    .where(eq(sessionFamiliesTable.id, session.family))
    .limit(1);
  if (!family || family.revokedAt) return null;
  const [successor] = await db
    .select()
    .from(refreshSessionsTable)
    .where(
      and(
        eq(refreshSessionsTable.jti, session.successorJti),
        eq(refreshSessionsTable.userId, session.userId),
        eq(refreshSessionsTable.family, session.family),
        isNull(refreshSessionsTable.rotatedAt),
        gt(refreshSessionsTable.expiresAt, now)
      )
    )
    .limit(1);
  if (!successor) return null;
  const user = await findUser(session.userId);
  return user ? { user, tokens: tokensFor(user, successor.jti, successor.issuedAt) } : null;
};

const settleRotated = async (session: Session, now: Date) => {
  const recovered = await recoverConcurrentRotation(session, now);
  if (recovered) return recovered;
  // Replay of a token that was already rotated: treat the whole account's sessions as compromised.
  if (!withinGrace(session, now)) {
    const [family] = await db
      .select({ revokedAt: sessionFamiliesTable.revokedAt })
      .from(sessionFamiliesTable)
      .where(eq(sessionFamiliesTable.id, session.family))
      .limit(1);
    if (family && !family.revokedAt) await revokeAll(session.userId);
  }
  return null;
};

export const rotateSession = async (refreshToken: string): Promise<{ user: SessionUser; tokens: ITokens } | null> => {
  const claims = decode(refreshToken);
  if (!claims) return null;

  const now = new Date();
  const known = await findSession(claims.jti, claims.userId);
  if (!known) {
    await revokeAll(claims.userId);
    return null;
  }
  if (known.rotatedAt) return settleRotated(known, now);

  const user = await findUser(claims.userId);
  if (!user) return null;

  // The family row serializes this rotation with logout and other token rotations.
  const jti = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokens = tokensFor(user, jti, issuedAt);
  const expiresAt = tokenExpiry(tokens.refreshToken);
  const result = await db.transaction(async (tx) => {
    const [family] = await tx
      .select()
      .from(sessionFamiliesTable)
      .where(eq(sessionFamiliesTable.id, known.family))
      .for('update')
      .limit(1);
    if (!family || family.revokedAt) return 'revoked' as const;

    const [current] = await tx
      .select()
      .from(refreshSessionsTable)
      .where(eq(refreshSessionsTable.id, known.id))
      .for('update')
      .limit(1);
    if (!current || current.expiresAt <= now) return 'invalid' as const;
    if (current.rotatedAt) return 'rotated' as const;

    const [row] = await tx
      .update(refreshSessionsTable)
      .set({ rotatedAt: now, successorJti: jti })
      .where(
        and(
          eq(refreshSessionsTable.id, known.id),
          isNull(refreshSessionsTable.rotatedAt),
          gt(refreshSessionsTable.expiresAt, now)
        )
      )
      .returning({ id: refreshSessionsTable.id });
    if (!row) return 'rotated' as const;
    await tx.insert(refreshSessionsTable).values({
      userId: user.id,
      jti,
      family: known.family,
      issuedAt,
      expiresAt,
    });
    await tx
      .update(sessionFamiliesTable)
      .set({ expiresAt })
      .where(eq(sessionFamiliesTable.id, known.family));
    return 'rotated-successfully' as const;
  });

  if (result === 'rotated-successfully') return { user, tokens };
  if (result !== 'rotated') return null;
  const current = await findSession(claims.jti, claims.userId);
  return current?.rotatedAt ? settleRotated(current, now) : null;
};

export const endSession = async (refreshToken: string): Promise<void> => {
  const claims = decode(refreshToken);
  if (!claims) return;
  const session = await findSession(claims.jti, claims.userId);
  if (!session) return;
  await db.transaction(async (tx) => {
    const [family] = await tx
      .select()
      .from(sessionFamiliesTable)
      .where(eq(sessionFamiliesTable.id, session.family))
      .for('update')
      .limit(1);
    if (!family || family.revokedAt) return;
    await tx
      .update(sessionFamiliesTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessionFamiliesTable.id, family.id), isNull(sessionFamiliesTable.revokedAt)));
  });
};
