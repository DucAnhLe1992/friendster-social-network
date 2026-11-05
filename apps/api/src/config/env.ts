import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

const secret = (name: string, devFallback: string): string => {
  const value = process.env[name];
  if (value) return value;
  if (NODE_ENV === 'production') {
    throw new Error(`${name} must be set in production`);
  }
  return devFallback;
};

export const env = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || '5000', 10),

  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/friendster',

  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',

  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300', 10),
};

export default env;
