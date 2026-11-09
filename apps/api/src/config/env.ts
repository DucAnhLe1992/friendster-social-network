import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const LOCAL_DATABASE_URL = 'postgresql://friendster:friendster@localhost:5432/friendster';

const optionalString = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());
const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.string().url().optional());

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    LOG_LEVEL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional()
    ),

    DATABASE_URL: optionalUrl,
    DATABASE_URL_DIRECT: optionalUrl,

    JWT_ACCESS_SECRET: optionalString,
    JWT_REFRESH_SECRET: optionalString,
    JWT_ACCESS_EXPIRY: z.string().default('15m'),
    JWT_REFRESH_EXPIRY: z.string().default('7d'),

    CORS_ORIGIN: optionalString,

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;
    const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (!value.DATABASE_URL) fail('DATABASE_URL', 'must be set in production');
    for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if ((value[name]?.length ?? 0) < 32) fail(name, 'must be a random string of at least 32 characters in production');
    }
    if (value.JWT_ACCESS_SECRET && value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      fail('JWT_REFRESH_SECRET', 'must differ from JWT_ACCESS_SECRET');
    }
    if (!value.CORS_ORIGIN) fail('CORS_ORIGIN', 'must be set in production');
  });

export const parseEnvironment = (source: NodeJS.ProcessEnv) => {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const raw = parsed.data;

  const databaseUrl = raw.DATABASE_URL ?? LOCAL_DATABASE_URL;

  return {
    NODE_ENV: raw.NODE_ENV,
    PORT: raw.PORT,
    LOG_LEVEL: raw.LOG_LEVEL ?? (raw.NODE_ENV === 'test' ? 'silent' : raw.NODE_ENV === 'production' ? 'info' : 'debug'),

    DATABASE_URL: databaseUrl,
    DATABASE_URL_DIRECT: raw.DATABASE_URL_DIRECT ?? databaseUrl,

    JWT_ACCESS_SECRET: raw.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    JWT_REFRESH_SECRET: raw.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    JWT_ACCESS_EXPIRY: raw.JWT_ACCESS_EXPIRY,
    JWT_REFRESH_EXPIRY: raw.JWT_REFRESH_EXPIRY,

    CORS_ORIGIN: (raw.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),

    RATE_LIMIT_WINDOW_MS: raw.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS: raw.RATE_LIMIT_MAX_REQUESTS,
  };
};

export const env = parseEnvironment(process.env);

export default env;
