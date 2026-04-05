import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initDb } from './db';
import { initSocket } from './socket';

import authRoutes from './routes/auth';
import workspaceRoutes, { setIo as setWorkspaceIo } from './routes/workspaces';
import channelRoutes, { setIo as setChannelIo } from './routes/channels';
import boardRoutes from './routes/boards';
import taskRoutes, { setIo as setTaskIo } from './routes/tasks';
import dmRoutes, { setIo as setDmIo } from './routes/dms';
import notificationRoutes from './routes/notifications';

const app = express();
const server = createServer(app);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Set CORS_ORIGIN in your Railway env vars (comma-separated for multiple):
//   CORS_ORIGIN=https://work-frontend-five.vercel.app
const rawOrigins = process.env.CORS_ORIGIN
  || 'http://localhost:5173,http://localhost:5174,http://localhost:4200';

export const allowedOrigins = rawOrigins.split(',').map(o => o.trim());

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Init DB (auto-creates tables if they don't exist)
initDb();

// Init Socket.IO — passes the same allowed origins so WS and HTTP stay in sync
const io = initSocket(server, allowedOrigins);
setWorkspaceIo(io);
setChannelIo(io);
setTaskIo(io);
setDmIo(io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/dms', dmRoutes);
app.use('/api/notifications', notificationRoutes);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`✅ Allowed origins: ${allowedOrigins.join(', ')}`);
});
