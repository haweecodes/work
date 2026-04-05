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

app.use(cors());
app.use(express.json());

// Init DB
initDb();

// Init Socket.IO
const io = initSocket(server);
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
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
