import path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';
import { logger } from '../utils/logger';

export const MIGRATIONS_FOLDER = path.join(__dirname, '../../migrations');

// Neon pooled URLs serve application traffic; schema changes use a separate direct connection.
export const pool = new Pool({
	connectionString: env.DATABASE_URL,
	max: 10,
	connectionTimeoutMillis: 10_000,
	idleTimeoutMillis: 30_000,
	query_timeout: 30_000,
});
pool.on('error', (err) => logger.error({ err }, 'unexpected database pool error'));

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

// Opened only by the migration entry point, so the running API never holds a direct (unpooled) connection.
export const runMigrations = async () => {
	const migrationPool = new Pool({
		connectionString: env.DATABASE_URL_DIRECT,
		max: 1,
		connectionTimeoutMillis: 10_000,
		query_timeout: 60_000,
	});
	try {
		await migrate(drizzle({ client: migrationPool, schema }), { migrationsFolder: MIGRATIONS_FOLDER });
	} finally {
		await migrationPool.end();
	}
};

export const closePools = () => pool.end();
