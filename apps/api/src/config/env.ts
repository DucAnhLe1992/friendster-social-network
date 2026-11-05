import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

const isProduction = NODE_ENV === 'production';

const secret = (name: string, devFallback: string): string => {
  const value = process.env[name];
  if (isProduction && (!value || value.length < 32)) {
    throw new Error(`${name} must be set to a random string of at least 32 characters in production`);
  }
  return value || devFallback;
};

const corsOrigins = (): string[] => {
  const value = process.env.CORS_ORIGIN;
  if (!value && isProduction) throw new Error('CORS_ORIGIN must be set in production');
  return (value || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
};

export const env = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || '5000', 10),

  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/friendster',

  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',

  CORS_ORIGIN: corsOrigins(),

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300', 10),
};

if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET && isProduction) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
}

export default env;
