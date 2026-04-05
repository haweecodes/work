import { Server, Socket } from 'socket.io';

let io: Server;

export function initSocket(server: any, allowedOrigins: string[]) {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    }
  });

  io.on('connection', (socket: Socket) => {
    // console.log('Client connected:', socket.id);

    socket.on('join_workspace', (workspaceId: string) => {
      socket.join(`workspace:${workspaceId}`);
    });

    socket.on('join_channel', (channelId: string) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on('leave_channel', (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });
    
    socket.on('join_dm', (threadId: string) => {
      socket.join(`dm:${threadId}`);
    });

    socket.on('join_board', (boardId: string) => {
      socket.join(`board:${boardId}`);
    });

    socket.on('join_user', (userId: string) => {
      socket.join(`user:${userId}`);
    });

    socket.on('disconnect', () => {
      // console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}

export function getIo(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}
