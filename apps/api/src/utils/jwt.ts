import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ITokens, ITokenPayload } from '../types';

type Expiry = NonNullable<SignOptions['expiresIn']>;

export const generateTokens = (payload: ITokenPayload): ITokens => {
  const claims = { userId: payload.userId, handle: payload.handle, role: payload.role };

  const accessToken = jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as Expiry,
  });

  const refreshToken = jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as Expiry,
  });

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string): ITokenPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as ITokenPayload;
};

export const verifyRefreshToken = (token: string): ITokenPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as ITokenPayload;
};
