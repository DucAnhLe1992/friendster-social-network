import crypto from 'crypto';
import { RefreshSession, User } from '../models';
import { generateTokens, tokenExpiry, verifyRefreshToken } from '../utils/jwt';
import { IUser, ITokens } from '../types';

// Concurrent refreshes from several tabs may legitimately present the same token for a moment.
const REUSE_GRACE_MS = 30 * 1000;

const issue = async (user: IUser, family: string): Promise<ITokens> => {
  const jti = crypto.randomUUID();
  const tokens = generateTokens({ userId: user._id.toString(), handle: user.handle, role: user.role }, jti);
  await RefreshSession.create({ user: user._id, jti, family, expiresAt: tokenExpiry(tokens.refreshToken) });
  return tokens;
};

export const startSession = (user: IUser): Promise<ITokens> => issue(user, crypto.randomUUID());

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
  // Rotated records are kept until their own expiry so logout and replay detection can still find the family.
  const claimed = await RefreshSession.findOneAndUpdate(
    { jti: claims.jti, user: claims.userId, rotatedAt: null, expiresAt: { $gt: now } },
    { $set: { rotatedAt: now } }
  );

  if (!claimed) {
    const known = await RefreshSession.findOne({ jti: claims.jti }).lean();
    const withinGrace = known?.rotatedAt && now.getTime() - known.rotatedAt.getTime() < REUSE_GRACE_MS;
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

  const family = claimed.family ?? claimed.jti;
  const tokens = await issue(user, family);

  // A logout that raced this rotation deleted the family before our successor existed; honour it.
  if (!(await RefreshSession.exists({ _id: claimed._id }))) {
    await RefreshSession.deleteMany({ family });
    return null;
  }

  return { user, tokens };
};

export const endSession = async (refreshToken: string): Promise<void> => {
  const claims = decode(refreshToken);
  if (!claims) return;
  const session = await RefreshSession.findOne({ jti: claims.jti, user: claims.userId }).lean();
  if (!session) return;
  await RefreshSession.deleteMany({ user: claims.userId, family: session.family ?? session.jti });
};
