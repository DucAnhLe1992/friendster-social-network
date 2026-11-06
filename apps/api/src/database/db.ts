import path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

export const MIGRATIONS_FOLDER = path.join(__dirname, '../../migrations');

// Neon connection strings carry `sslmode=require`, which turns TLS on; a local Postgres URL without it connects plainly.
export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export const runMigrations = () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
