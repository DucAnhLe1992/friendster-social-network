import path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

export const MIGRATIONS_FOLDER = path.join(__dirname, '../../migrations');

// Neon pooled URLs serve application traffic; schema changes use a separate direct connection.
export const pool = new Pool({
	connectionString: env.DATABASE_URL,
	max: 10,
	connectionTimeoutMillis: 10_000,
	idleTimeoutMillis: 30_000,
	query_timeout: 30_000,
});
pool.on('error', (error) => console.error('Unexpected runtime database pool error:', error));

export const db = drizzle({ client: pool, schema });

const migrationPool = new Pool({
	connectionString: env.DATABASE_URL_DIRECT,
	max: 1,
	connectionTimeoutMillis: 10_000,
	idleTimeoutMillis: 30_000,
	query_timeout: 60_000,
});
migrationPool.on('error', (error) => console.error('Unexpected migration database pool error:', error));
const migrationDb = drizzle({ client: migrationPool, schema });

export type Database = typeof db;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export const runMigrations = () => migrate(migrationDb, { migrationsFolder: MIGRATIONS_FOLDER });

export const closePools = async () => Promise.all([pool.end(), migrationPool.end()]);
