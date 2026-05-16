import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { get } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-prod';

let io: Server;

export function initSocket(server: any, allowedOrigins: string[]) {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    }
  });

  // ── Auth middleware — verify JWT on every connection ──────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
      ?? (socket.handshake.query?.token as string | undefined);
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
      socket.data.userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId: string = socket.data.userId;

    // User room — only your own room
    socket.on('join_user', (uid: string) => {
      if (uid === userId) socket.join(`user:${userId}`);
    });

    socket.on('join_workspace', async (workspaceId: string) => {
      const member = await get(
        'SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
        [workspaceId, userId]
      );
      if (member) socket.join(`workspace:${workspaceId}`);
    });

    socket.on('join_channel', async (channelId: string) => {
      const member = await get(
        'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
        [channelId, userId]
      );
      if (member) socket.join(`channel:${channelId}`);
    });

    socket.on('leave_channel', (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on('join_dm', async (threadId: string) => {
      const participant = await get(
        'SELECT 1 FROM dm_participants WHERE thread_id = ? AND user_id = ?',
        [threadId, userId]
      );
      if (participant) socket.join(`dm:${threadId}`);
    });

    socket.on('leave_dm', (threadId: string) => {
      socket.leave(`dm:${threadId}`);
    });

    socket.on('join_board', async (boardId: string) => {
      const board = await get<{ workspace_id: string }>(
        'SELECT workspace_id FROM boards WHERE id = ?',
        [boardId]
      );
      if (!board) return;
      const member = await get(
        'SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
        [board.workspace_id, userId]
      );
      if (member) socket.join(`board:${boardId}`);
    });

    // Typing indicators — use server-verified userId, not the client-supplied value
    socket.on('typing_start', ({ channelId, dmThreadId, userName }: {
      channelId?: string; dmThreadId?: string; userName: string;
    }) => {
      const room = channelId ? `channel:${channelId}` : dmThreadId ? `dm:${dmThreadId}` : null;
      if (room) socket.to(room).emit('user_typing', { userId, userName, channelId, dmThreadId });
    });

    socket.on('typing_stop', ({ channelId, dmThreadId }: {
      channelId?: string; dmThreadId?: string;
    }) => {
      const room = channelId ? `channel:${channelId}` : dmThreadId ? `dm:${dmThreadId}` : null;
      if (room) socket.to(room).emit('user_stopped_typing', { userId, channelId, dmThreadId });
    });
  });

  return io;
}

export function getIo(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}
