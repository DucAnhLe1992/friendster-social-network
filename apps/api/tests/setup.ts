import path from 'path';
import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import * as schema from '../src/database/schema';

process.env.NODE_ENV = 'test';
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

// CI provides a real Postgres through DATABASE_URL_TEST; locally each test file gets its own in-memory Postgres.
vi.mock('../src/database/db', async (importOriginal) => {
  if (process.env.DATABASE_URL_TEST) return importOriginal();

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const client = new PGlite();
  const db = drizzle({ client, schema });
  const MIGRATIONS_FOLDER = path.resolve(__dirname, '../migrations');
  return {
    db,
    MIGRATIONS_FOLDER,
    pool: { query: (text: string) => client.query(text), end: () => client.close() },
    runMigrations: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
  };
});

const tableNames = Object.values(schema)
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`)
  .join(', ');

beforeAll(async () => {
  const { runMigrations } = await import('../src/database/db');
  await runMigrations();
});

beforeEach(async () => {
  const { db } = await import('../src/database/db');
  await db.execute(sql.raw(`TRUNCATE TABLE ${tableNames} CASCADE`));
});

afterAll(async () => {
  const { pool } = await import('../src/database/db');
  await pool.end();
});
