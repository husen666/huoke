import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { config } from '../config/env.js';
import type { JwtPayload } from '../middleware/auth.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema/index.js';

let _io: Server | null = null;
export function getIO(): Server | null { return _io; }

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000' },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token as string, config.JWT_SECRET) as JwtPayload;
      (socket as any).user = decoded;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  io.on('connection', (socket) => {
    const user: JwtPayload = (socket as any).user;

    socket.join(`user:${user.sub}`);
    socket.join(`org:${user.orgId}`);

    db.update(users)
      .set({ onlineStatus: 'online', lastOnlineAt: new Date() })
      .where(eq(users.id, user.sub))
      .execute()
      .catch(() => {});
    io.to(`org:${user.orgId}`).emit('agent:status', { agentId: user.sub, status: 'online' });

    socket.on('conversation:join', (conversationId: string) => {
      if (!conversationId || !UUID_RE.test(conversationId)) return;
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('conversation:leave', (conversationId: string) => {
      if (!conversationId || !UUID_RE.test(conversationId)) return;
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('agent:status', (payload: { status: string }) => {
      io.to(`org:${user.orgId}`).emit('agent:status', {
        ...payload,
        agentId: user.sub,
      });
    });

    socket.on('typing:start', (conversationId: string) => {
      if (!conversationId || !UUID_RE.test(conversationId)) return;
      socket.to(`conversation:${conversationId}`).emit('typing:start', {
        conversationId,
        agentId: user.sub,
      });
    });

    socket.on('typing:stop', (conversationId: string) => {
      if (!conversationId || !UUID_RE.test(conversationId)) return;
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        conversationId,
        agentId: user.sub,
      });
    });

    socket.on('message:read', (data: { conversationId: string; lastReadMessageId: string }) => {
      if (!data?.conversationId || !UUID_RE.test(data.conversationId)) return;
      if (!data?.lastReadMessageId || !UUID_RE.test(data.lastReadMessageId)) return;
      io.to(`conversation:${data.conversationId}`).emit('message:read', {
        userId: user.sub,
        conversationId: data.conversationId,
        lastReadMessageId: data.lastReadMessageId,
        readAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      const remaining = io.sockets.adapter.rooms.get(`user:${user.sub}`);
      if (!remaining || remaining.size === 0) {
        db.update(users)
          .set({ onlineStatus: 'offline', lastOnlineAt: new Date() })
          .where(eq(users.id, user.sub))
          .execute()
          .catch(() => {});
        io.to(`org:${user.orgId}`).emit('agent:status', { agentId: user.sub, status: 'offline' });
      }
    });
  });

  _io = io;
  return io;
}

export function emitMessageNew(
  io: Server,
  conversationId: string,
  data: { content: string; senderType?: string; messageId?: string }
) {
  io.to(`conversation:${conversationId}`).emit('message:new', {
    conversationId,
    ...data,
  });
}

export function emitConversationAssigned(
  io: Server,
  conversationId: string,
  data: { agentId: string }
) {
  io.to(`conversation:${conversationId}`).emit('conversation:assigned', data);
}

export function emitNotificationNew(
  io: Server,
  userId: string,
  data: { type: string; title: string; content?: string; resourceType?: string; resourceId?: string }
) {
  io.to(`user:${userId}`).emit('notification:new', data);
}
