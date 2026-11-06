import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../database/db';
import { refreshSessionsTable, usersTable } from '../database/schema';
import { generateTokens, tokenExpiry, verifyRefreshToken } from '../utils/jwt';
import { AuthUser, ITokens } from '../types';

// Concurrent refreshes from several tabs may legitimately present the same token for a moment.
const REUSE_GRACE_MS = 30 * 1000;

type SessionUser = Pick<AuthUser, 'id' | 'handle' | 'role'>;
type Session = typeof refreshSessionsTable.$inferSelect;

const tokensFor = (user: SessionUser, jti: string, issuedAt: number) =>
  generateTokens({ userId: user.id, handle: user.handle, role: user.role }, jti, issuedAt);

const issue = async (user: SessionUser, family: string) => {
  const jti = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokens = tokensFor(user, jti, issuedAt);
  await db
    .insert(refreshSessionsTable)
    .values({ userId: user.id, jti, family, issuedAt, expiresAt: tokenExpiry(tokens.refreshToken) });
  return { jti, tokens };
};

export const startSession = async (user: SessionUser): Promise<ITokens> =>
  (await issue(user, crypto.randomUUID())).tokens;

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

const revokeAll = (userId: string) => db.delete(refreshSessionsTable).where(eq(refreshSessionsTable.userId, userId));

const withinGrace = (session: Session, now: Date) =>
  Boolean(session.rotatedAt && now.getTime() - session.rotatedAt.getTime() < REUSE_GRACE_MS);

// A tab that lost the rotation race within the grace window receives the winner's tokens instead of being signed out.
const recoverConcurrentRotation = async (session: Session, now: Date) => {
  if (!withinGrace(session, now) || !session.successorJti) return null;
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
  if (!withinGrace(session, now)) await revokeAll(session.userId);
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

  // Claiming the old token and creating its successor commit together, so a racing logout or rotation sees either
  // both or neither.
  const jti = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokens = tokensFor(user, jti, issuedAt);
  const claimed = await db.transaction(async (tx) => {
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
    if (!row) return false;
    await tx.insert(refreshSessionsTable).values({
      userId: user.id,
      jti,
      family: known.family,
      issuedAt,
      expiresAt: tokenExpiry(tokens.refreshToken),
    });
    return true;
  });

  if (claimed) return { user, tokens };
  const current = await findSession(claims.jti, claims.userId);
  return current ? settleRotated(current, now) : null;
};

export const endSession = async (refreshToken: string): Promise<void> => {
  const claims = decode(refreshToken);
  if (!claims) return;
  await db
    .delete(refreshSessionsTable)
    .where(
      and(
        eq(refreshSessionsTable.userId, claims.userId),
        eq(
          refreshSessionsTable.family,
          sql`(select ${refreshSessionsTable.family} from ${refreshSessionsTable} where ${refreshSessionsTable.jti} = ${claims.jti})`
        )
      )
    );
};
