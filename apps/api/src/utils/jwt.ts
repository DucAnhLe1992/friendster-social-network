import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ITokens, ITokenPayload } from '../types';

type Expiry = NonNullable<SignOptions['expiresIn']>;

export const generateTokens = (payload: ITokenPayload, sessionId: string, issuedAt?: number): ITokens => {
  const claims = {
    userId: payload.userId,
    handle: payload.handle,
    role: payload.role,
    ...(issuedAt !== undefined && { iat: issuedAt }),
  };

  const accessToken = jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as Expiry,
  });

  const refreshToken = jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as Expiry,
    jwtid: sessionId,
  });

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string): ITokenPayload & JwtPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as ITokenPayload & JwtPayload;
};

export const verifyRefreshToken = (token: string): ITokenPayload & JwtPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as ITokenPayload & JwtPayload;
};

export const tokenExpiry = (token: string): Date => {
  const { exp } = jwt.decode(token) as JwtPayload;
  return new Date((exp ?? 0) * 1000);
};
