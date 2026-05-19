import 'dotenv/config';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

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
import notificationRoutes, { setIo as setNotifIo } from './routes/notifications';
import searchRoutes from './routes/search';
import taskUpdateRoutes, { setIo as setTaskUpdateIo } from './routes/taskUpdates';
import { authMiddleware } from './middleware/auth';
import { requireWorkspace } from './middleware/workspace';

const app = express();
const server = createServer(app);

// ── CORS ──────────────────────────────────────────────────────────────────────
const rawOrigins = process.env.CORS_ORIGIN
  || 'http://localhost:5173,http://localhost:5174,http://localhost:4200';

export const allowedOrigins = rawOrigins.split(',').map(o => o.trim());

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
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

// Init Socket.IO — passes the same allowed origins so WS and HTTP stay in sync
const io = initSocket(server, allowedOrigins);
setWorkspaceIo(io);
setChannelIo(io);
setTaskIo(io);
setDmIo(io);
setNotifIo(io);
setTaskUpdateIo(io);

// Routes
// Auth and workspace management are unguarded — no workspace context needed
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);

// All other routes require auth + valid workspace membership
const protect = [authMiddleware, requireWorkspace()];
app.use('/api/channels',      ...protect, channelRoutes);
app.use('/api/boards',        ...protect, boardRoutes);
app.use('/api/tasks',         ...protect, taskRoutes);
app.use('/api/dms',           ...protect, dmRoutes);
app.use('/api/notifications', ...protect, notificationRoutes);
app.use('/api/search',        ...protect, searchRoutes);
app.use('/api/task-updates',  ...protect, taskUpdateRoutes);

const PORT = process.env.PORT || 3001;

(async () => {
  await initDb();
  server.listen(PORT, () => {
    console.log(`🚀 Backend running on port ${PORT}`);
    console.log(`✅ Allowed origins: ${allowedOrigins.join(', ')}`);
  });
})();
