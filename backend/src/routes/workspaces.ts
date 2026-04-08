import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { all, get, run } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
let io: Server | undefined;

export const setIo = (socketIo: Server) => { io = socketIo; };

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const workspaces = await all(
    `SELECT w.* FROM workspaces w
     JOIN workspace_members wm ON w.id = wm.workspace_id
     WHERE wm.user_id = ?
     ORDER BY w.created_at ASC`,
    [req.user?.id]
  );
  res.json(workspaces);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const id = uuidv4();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + id.slice(0, 6);
    const invite_code = uuidv4().replace(/-/g, '').slice(0, 12);

    await run('INSERT INTO workspaces (id, name, slug, owner_id, invite_code) VALUES (?, ?, ?, ?, ?)',
      [id, name, slug, req.user.id, invite_code]);

    await run('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)',
      [id, req.user.id, 'admin']);

    const channelId = uuidv4();
    await run('INSERT INTO channels (id, workspace_id, name, is_private, created_by) VALUES (?, ?, ?, ?, ?)',
      [channelId, id, 'general', 0, req.user.id]);
    await run('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)',
      [channelId, req.user.id]);



    const workspace = await get('SELECT * FROM workspaces WHERE id = ?', [id]);
    res.status(201).json(workspace);
  } catch (err: any) {
    console.error('Workspace creation error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

router.get('/:id/members', authMiddleware, async (req: Request, res: Response) => {
  const members = await all(
    `SELECT u.id, u.name, u.email, u.avatar_url, wm.role
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = ?`,
    [req.params.id]
  );
  res.json(members);
});

router.post('/:id/invite', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(404).json({ error: 'User not found. They need to register first.' });
    }

    const existing = await get('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [req.params.id, user.id]);
    if (existing) return res.status(409).json({ error: 'User is already a member' });

    await run('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)',
      [req.params.id, user.id, 'member']);

    const general = await get('SELECT id FROM channels WHERE workspace_id = ? AND name = ?',
      [req.params.id, 'general']);
    if (general) {
      await run('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
        [general.id, user.id]);
    }

    if (io) {
      const newMember = await get(`SELECT u.id, u.name, u.email, u.avatar_url, 'member' as role FROM users u WHERE u.id = ?`, [user.id]);
      io.to(`workspace:${req.params.id}`).emit('member_joined', newMember);
    }

    res.json({ message: 'User invited successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/join/:code', async (req: Request, res: Response) => {
  try {
    const workspace = await get('SELECT id, name FROM workspaces WHERE invite_code = ?', [req.params.code]);
    if (!workspace) return res.status(404).json({ error: 'Invalid invite code' });
    res.json(workspace);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/join/:code', authMiddleware, async (req: Request, res: Response) => {
  try {
    const workspace = await get('SELECT * FROM workspaces WHERE invite_code = ?', [req.params.code]);
    if (!workspace) return res.status(404).json({ error: 'Invalid invite code' });
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const existing = await get('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspace.id, req.user.id]);
    if (existing) return res.status(409).json({ error: 'Already a member' });

    await run('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)',
      [workspace.id, req.user.id, 'member']);

    const general = await get('SELECT id FROM channels WHERE workspace_id = ? AND name = ?',
      [workspace.id, 'general']);
    if (general) {
      await run('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
        [general.id, req.user.id]);
    }

    if (io) {
      const newMember = await get(`SELECT u.id, u.name, u.email, u.avatar_url, 'member' as role FROM users u WHERE u.id = ?`, [req.user.id]);
      io.to(`workspace:${workspace.id}`).emit('member_joined', newMember);
    }

    res.json(workspace);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
