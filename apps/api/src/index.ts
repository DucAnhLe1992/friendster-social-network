import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';

import { env } from './config/env';
import connectDB from './config/database';
import { errorHandler, notFound } from './middleware/errorHandler';
import { UPLOADS_ROOT } from './middleware/upload';
import { setupRealtime } from './realtime';

import authRoutes from './routes/auth';
import postRoutes from './routes/posts';
import userRoutes from './routes/users';
import commentRoutes from './routes/comments';
import notificationRoutes from './routes/notifications';
import conversationRoutes from './routes/conversations';

const app = express();
const httpServer = createServer(app);
const io = setupRealtime(httpServer);
app.set('io', io);
app.set('trust proxy', 1);

connectDB();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

app.use(
  '/api/',
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
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

app.use('/api/auth', authRoutes);
app.use('/api/posts/:id/comments', commentRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/conversations', conversationRoutes);

app.use(notFound);
app.use(errorHandler);

httpServer.listen(env.PORT, () => {
  console.log(`Friendster API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

export default app;
