import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { pool } from './database/db';
import { createServer } from 'http';

import { env } from './config/env';
import { errorHandler, notFound, requestLogger } from './middleware/errorHandler';
import { UPLOADS_ROOT } from './middleware/upload';
import { setupRealtime } from './realtime';

import authRoutes from './routes/auth';
import postRoutes from './routes/posts';
import userRoutes from './routes/users';
import commentRoutes from './routes/comments';
import notificationRoutes from './routes/notifications';
import conversationRoutes from './routes/conversations';

export const createApp = () => {
  const app = express();
  const httpServer = createServer(app);
  const io = setupRealtime(httpServer);
  app.set('io', io);
  app.set('trust proxy', 1);
  let draining = false;

  app.use(requestLogger);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

  app.use(
    '/api/',
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX_REQUESTS,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { success: false, error: 'Too many requests, please try again later' },
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.use('/uploads', express.static(UPLOADS_ROOT, { maxAge: '7d' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // Fails while shutting down so the load balancer stops routing here before connections close.
  app.get('/ready', async (_req, res) => {
    if (draining) {
      res.status(503).json({ status: 'DRAINING', database: null });
      return;
    }
    const ready = await pool.query('select 1').then(() => true, () => false);
    res.status(ready ? 200 : 503).json({ status: ready ? 'READY' : 'UNAVAILABLE', database: ready });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/posts/:id/comments', commentRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/conversations', conversationRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return {
    app,
    httpServer,
    io,
    startDraining: () => {
      draining = true;
    },
  };
};
