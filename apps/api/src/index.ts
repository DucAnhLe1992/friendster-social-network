import { env } from './config/env';
import { pool, runMigrations } from './database/db';
import { createApp } from './app';
import { sweepAbandonedUploads } from './services/media';

const ABANDONED_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;

const start = async () => {
  await runMigrations();

  const { httpServer, io } = createApp();
  httpServer.listen(env.PORT, () => {
    console.log(`Friendster API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const sweep = () =>
    sweepAbandonedUploads(ABANDONED_UPLOAD_AGE_MS)
      .then((count) => count && console.log(`Removed ${count} abandoned upload(s)`))
      .catch((error) => console.error('Upload sweep failed:', error));
  const sweeper = setInterval(sweep, 60 * 60 * 1000);
  sweeper.unref();
  void sweep();

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    clearInterval(sweeper);
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
    io.close();
    httpServer.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
