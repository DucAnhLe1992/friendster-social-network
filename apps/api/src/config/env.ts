import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

const isProduction = NODE_ENV === 'production';

const secret = (name: string, devFallback: string): string => {
  const value = process.env[name];
  return value || devFallback;
};

const corsOrigins = (): string[] => {
  const value = process.env.CORS_ORIGIN;
  return (value || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
};

// Neon (or any PostgreSQL) connection string; locally falls back to the Postgres from docker-compose.dev.yml.
const databaseUrl = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value && isProduction) throw new Error('DATABASE_URL must be set in production');
  return value || 'postgresql://friendster:friendster@localhost:5432/friendster';
};

const databaseUrlDirect = (): string => process.env.DATABASE_URL_DIRECT || databaseUrl();

export const env = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || '5000', 10),

  DATABASE_URL: databaseUrl(),
  DATABASE_URL_DIRECT: databaseUrlDirect(),

  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',

  CORS_ORIGIN: corsOrigins(),

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300', 10),
};

export const assertProductionConfig = (): void => {
  if (!isProduction) return;
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = process.env[name];
    if (!value || value.length < 32) {
      throw new Error(`${name} must be set to a random string of at least 32 characters in production`);
    }
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (!process.env.CORS_ORIGIN) throw new Error('CORS_ORIGIN must be set in production');
};

export default env;
