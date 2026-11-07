import { closePools, runMigrations } from './database/db';

const migrate = async () => {
  try {
    await runMigrations();
  } finally {
    await closePools();
  }
};

migrate().catch((error) => {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
});