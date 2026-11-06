import crypto from 'crypto';
import { RefreshSession, User } from '../models';
import { generateTokens, tokenExpiry, verifyRefreshToken } from '../utils/jwt';
import { IUser, ITokens } from '../types';

// Concurrent refreshes from several tabs may legitimately present the same token for a moment.
const REUSE_GRACE_MS = 30 * 1000;

const issue = async (user: IUser, family: string) => {
  const jti = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokens = generateTokens({ userId: user._id.toString(), handle: user.handle, role: user.role }, jti, issuedAt);
  await RefreshSession.create({ user: user._id, jti, family, issuedAt, expiresAt: tokenExpiry(tokens.refreshToken) });
  return { jti, tokens };
};

export const startSession = async (user: IUser): Promise<ITokens> => (await issue(user, crypto.randomUUID())).tokens;

const decode = (refreshToken: string) => {
  try {
    const payload = verifyRefreshToken(refreshToken);
    return payload.jti ? { userId: payload.userId, jti: payload.jti } : null;
  } catch {
    return null;
  }
};

export const rotateSession = async (refreshToken: string): Promise<{ user: IUser; tokens: ITokens } | null> => {
  const claims = decode(refreshToken);
  if (!claims) return null;

  const now = new Date();
  const known = await RefreshSession.findOne({ jti: claims.jti, user: claims.userId }).lean();
  if (!known) {
    await RefreshSession.deleteMany({ user: claims.userId });
    return null;
  }

  const recoverConcurrentRotation = async (session: typeof known) => {
    const withinGrace = session.rotatedAt && now.getTime() - session.rotatedAt.getTime() < REUSE_GRACE_MS;
    if (!withinGrace || !session.successorJti) return null;

    const successor = await RefreshSession.findOne({
      jti: session.successorJti,
      user: claims.userId,
      family: session.family,
      rotatedAt: null,
      expiresAt: { $gt: now },
    }).lean();
    if (!successor?.issuedAt) return null;

    const user = await User.findById(claims.userId);
    if (!user) return null;
    const tokens = generateTokens(
      { userId: user._id.toString(), handle: user.handle, role: user.role },
      successor.jti,
      successor.issuedAt
    );
    return { user, tokens };
  };

  if (known.rotatedAt) {
    const recovered = await recoverConcurrentRotation(known);
    if (recovered) return recovered;
    const withinGrace = now.getTime() - known.rotatedAt.getTime() < REUSE_GRACE_MS;
    if (!withinGrace) {
      // Replay of a token that was already rotated: treat the whole account's sessions as compromised.
      await RefreshSession.deleteMany({ user: claims.userId });
    }
    return null;
  }

  const user = await User.findById(claims.userId);
  if (!user) {
    await RefreshSession.deleteMany({ user: claims.userId });
    return null;
  }

  const family = known.family ?? known.jti;
  const successor = await issue(user, family);
  const claimed = await RefreshSession.findOneAndUpdate(
    { jti: claims.jti, user: claims.userId, rotatedAt: null, expiresAt: { $gt: now } },
    { $set: { rotatedAt: now, successorJti: successor.jti } }
  );

  if (!claimed) {
    await RefreshSession.deleteOne({ jti: successor.jti, user: claims.userId });
    const current = await RefreshSession.findOne({ jti: claims.jti, user: claims.userId }).lean();
    if (!current) return null;
    const recovered = await recoverConcurrentRotation(current);
    if (recovered) return recovered;
    const withinGrace = current.rotatedAt && now.getTime() - current.rotatedAt.getTime() < REUSE_GRACE_MS;
    if (!withinGrace) await RefreshSession.deleteMany({ user: claims.userId });
    return null;
  }

  // A logout that raced this rotation deleted the family before our successor existed; honour it.
  if (!(await RefreshSession.exists({ _id: claimed._id }))) {
    await RefreshSession.deleteMany({ family });
    return null;
  }

  return { user, tokens: successor.tokens };
};

export const endSession = async (refreshToken: string): Promise<void> => {
  const claims = decode(refreshToken);
  if (!claims) return;
  const session = await RefreshSession.findOne({ jti: claims.jti, user: claims.userId }).lean();
  if (!session) return;
  await RefreshSession.deleteMany({ user: claims.userId, family: session.family ?? session.jti });
};
