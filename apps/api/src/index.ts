import { assertProductionConfig, env } from './config/env';
import { closePools } from './database/db';
import { createApp } from './app';
import { processFileDeletionJobs, sweepAbandonedUploads } from './services/media';
import { deleteExpiredSessions } from './services/sessions';

const ABANDONED_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

const start = async () => {
  assertProductionConfig();
  const { httpServer, io } = createApp();
  httpServer.listen(env.PORT, () => {
    console.log(`Friendster API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const sweep = () => {
    void sweepAbandonedUploads(ABANDONED_UPLOAD_AGE_MS)
      .then((count) => count && console.log(`Removed ${count} abandoned upload(s)`))
      .catch((error) => console.error('Upload sweep failed:', error));
    void deleteExpiredSessions()
      .then((count) => count && console.log(`Removed ${count} expired refresh session(s)`))
      .catch((error) => console.error('Refresh-session cleanup failed:', error));
    void processFileDeletionJobs()
      .then(({ completed, failed }) => {
        if (completed) console.log(`Removed ${completed} queued file(s)`);
        if (failed) console.error(`${failed} queued file deletion(s) will be retried`);
      })
      .catch((error) => console.error('File-deletion worker failed:', error));
  };
  const sweeper = setInterval(sweep, MAINTENANCE_INTERVAL_MS);
  sweeper.unref();
  void sweep();

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    clearInterval(sweeper);
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
    io.close();
    httpServer.close(async () => {
      await closePools();
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
