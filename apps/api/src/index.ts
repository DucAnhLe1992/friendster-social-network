import { env } from './config/env';
import { closePools } from './database/db';
import { createApp } from './app';
import { processFileDeletionJobs, sweepAbandonedUploads } from './services/media';
import { deleteExpiredSessions } from './services/sessions';
import { logger } from './utils/logger';

const ABANDONED_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const DRAIN_DELAY_MS = env.NODE_ENV === 'production' ? 5000 : 0;
const FORCE_EXIT_MS = 15000;

const start = async () => {
  const { httpServer, io, startDraining } = createApp();
  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
  });

  const sweep = () => {
    void sweepAbandonedUploads(ABANDONED_UPLOAD_AGE_MS)
      .then((count) => count && logger.info({ count }, 'removed abandoned uploads'))
      .catch((err) => logger.error({ err }, 'upload sweep failed'));
    void deleteExpiredSessions()
      .then((count) => count && logger.info({ count }, 'removed expired refresh sessions'))
      .catch((err) => logger.error({ err }, 'refresh-session cleanup failed'));
    void processFileDeletionJobs()
      .then(({ completed, failed }) => {
        if (completed) logger.info({ count: completed }, 'removed queued files');
        if (failed) logger.warn({ count: failed }, 'queued file deletions will be retried');
      })
      .catch((err) => logger.error({ err }, 'file-deletion worker failed'));
  };
  const sweeper = setInterval(sweep, MAINTENANCE_INTERVAL_MS);
  sweeper.unref();
  void sweep();

  let shuttingDown = false;
  const shutdown = (reason: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'shutting down');
    clearInterval(sweeper);
    startDraining();
    setTimeout(() => process.exit(1), FORCE_EXIT_MS).unref();

    // Give the load balancer a moment to see /ready fail, then stop accepting and close idle keep-alives.
    setTimeout(() => {
      io.close();
      httpServer.close(async () => {
        await closePools().catch((err) => logger.error({ err }, 'closing database pools failed'));
        process.exit(exitCode);
      });
      httpServer.closeIdleConnections();
    }, DRAIN_DELAY_MS).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.fatal({ err }, 'unhandled promise rejection');
    shutdown('unhandledRejection', 1);
  });
};

start().catch((err) => {
  logger.fatal({ err }, 'failed to start server');
  process.exit(1);
});
