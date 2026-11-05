import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env } from './config/env';
import { verifyAccessToken } from './utils/jwt';
import { Conversation } from './models';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types';

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export const userRoom = (userId: string): string => `user:${userId}`;

const otherParticipants = async (conversationId: string, userId: string): Promise<string[] | null> => {
  if (!/^[0-9a-fA-F]{24}$/.test(conversationId)) return null;
  const conversation = await Conversation.findOne({ _id: conversationId, participants: userId })
    .select('participants')
    .lean();
  if (!conversation) return null;
  return conversation.participants.map((id) => id.toString()).filter((id) => id !== userId);
};

export const setupRealtime = (httpServer: HttpServer): RealtimeServer => {
  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('Unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      socket.data.handle = payload.handle;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(userRoom(socket.data.userId));

    const relayTyping = (isTyping: boolean) => async (conversationId: string) => {
      try {
        const recipients = await otherParticipants(conversationId, socket.data.userId);
        if (!recipients) return;
        for (const id of recipients) {
          io.to(userRoom(id)).emit('user_typing', {
            conversationId,
            userId: socket.data.userId,
            isTyping,
          });
        }
      } catch (error) {
        console.error('Typing relay failed:', error);
      }
    };

    socket.on('typing_start', relayTyping(true));
    socket.on('typing_stop', relayTyping(false));
  });

  return io;
};
