import mongoose from 'mongoose';
import { env } from './config/env';
import connectDB from './config/database';
import { createApp } from './app';

const start = async () => {
  await connectDB(env.MONGODB_URI);

  const { httpServer, io } = createApp();
  httpServer.listen(env.PORT, () => {
    console.log(`Friendster API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
    io.close();
    httpServer.close(async () => {
      await mongoose.connection.close();
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
