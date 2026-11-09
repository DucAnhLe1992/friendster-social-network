import { closePools, runMigrations } from './database/db';
import { logger } from './utils/logger';

const migrate = async () => {
  try {
    await runMigrations();
    logger.info('database migrations applied');
  } finally {
    await closePools();
  }
};

migrate().catch((error) => {
  logger.fatal({ err: error }, 'database migration failed');
  process.exitCode = 1;
});