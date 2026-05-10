import express, { Request, Response } from 'express';
import { all } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const workspaceId = String(req.query.workspace_id ?? '').trim();

    if (!q || q.length < 2) return res.json({ messages: [], tasks: [] });
    if (!workspaceId) return res.status(400).json({ error: 'workspace_id required' });
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const pattern = `%${q}%`;
    const userId = req.user.id;

    // Messages in channels the user is a member of
    const messages = await all(
      `SELECT m.id, m.content, m.created_at, m.channel_id, m.dm_thread_id,
              u.name as sender_name, u.avatar_url as sender_avatar,
              c.name as channel_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN channels c ON c.id = m.channel_id
       LEFT JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = ?
       LEFT JOIN dm_participants dp ON dp.thread_id = m.dm_thread_id AND dp.user_id = ?
       WHERE m.is_system = 0
         AND m.content ILIKE ?
         AND (
           (m.channel_id IS NOT NULL AND cm.user_id IS NOT NULL AND c.workspace_id = ?)
           OR
           (m.dm_thread_id IS NOT NULL AND dp.user_id IS NOT NULL)
         )
       ORDER BY m.created_at DESC
       LIMIT 20`,
      [userId, userId, pattern, workspaceId]
    );

    // Tasks in boards in the workspace
    const tasks = await all(
      `SELECT t.id, t.title, t.priority, t.task_key, t.due_date, t.column_id,
              b.name as board_name, b.id as board_id,
              col.title as column_title
       FROM tasks t
       JOIN boards b ON b.id = t.board_id
       LEFT JOIN columns col ON col.id = t.column_id
       WHERE b.workspace_id = ?
         AND t.title ILIKE ?
       ORDER BY t.created_at DESC
       LIMIT 20`,
      [workspaceId, pattern]
    );

    res.json({ messages, tasks });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
