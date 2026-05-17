import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { all, get, run } from '../db';
import { enrichMessages } from '../lib/messageEnrich';
import { requireDmParticipant } from '../middleware/workspace';

const router = express.Router();
let io: Server | undefined;

export const setIo = (socketIo: Server) => { io = socketIo; };

// ── DM Threads ────────────────────────────────────────────────────────────────

router.get('/threads/:workspaceId', async (req: Request, res: Response) => {
  const threads = await all(
    `SELECT dt.id, dt.workspace_id, dt.created_at FROM dm_threads dt
     JOIN dm_participants dp ON dt.id = dp.thread_id
     WHERE dp.user_id = ? AND dt.workspace_id = ?`,
    [req.user?.id, req.params.workspaceId]
  );

  const enriched = await Promise.all(threads.map(async t => {
    const participants = await all(
      `SELECT u.id, u.name, u.avatar_url FROM dm_participants dp
       JOIN users u ON u.id = dp.user_id WHERE dp.thread_id = ?`,
      [t.id]
    );
    const lastMsg = await get(
      `SELECT content, created_at FROM messages WHERE dm_thread_id = ? AND parent_message_id IS NULL ORDER BY created_at DESC LIMIT 1`,
      [t.id]
    );
    return { ...t, participants, last_message: lastMsg };
  }));
  res.json(enriched);
});

router.post('/threads', async (req: Request, res: Response) => {
  try {
    const { other_user_id } = req.body;
    const workspace_id = req.workspaceId!;
    if (!other_user_id) {
      return res.status(400).json({ error: 'other_user_id required' });
    }

    // Verify the other user is also a workspace member before creating a thread
    const otherMember = await get(
      'SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspace_id, other_user_id]
    );
    if (!otherMember) return res.status(403).json({ error: 'That user is not a member of this workspace' });

    const existing = await get(
      `SELECT dt.id FROM dm_threads dt
       JOIN dm_participants dp1 ON dt.id = dp1.thread_id AND dp1.user_id = ?
       JOIN dm_participants dp2 ON dt.id = dp2.thread_id AND dp2.user_id = ?
       WHERE dt.workspace_id = ?
       LIMIT 1`,
      [req.user.id, other_user_id, workspace_id]
    );
    if (existing) {
      const participants = await all(
        `SELECT u.id, u.name, u.avatar_url FROM dm_participants dp JOIN users u ON u.id = dp.user_id WHERE dp.thread_id = ?`,
        [existing.id]
      );
      return res.json({ id: existing.id, workspace_id, participants });
    }

    const id = uuidv4();
    await run('INSERT INTO dm_threads (id, workspace_id) VALUES (?, ?)', [id, workspace_id]);
    await run('INSERT INTO dm_participants (thread_id, user_id) VALUES (?, ?)', [id, req.user.id]);
    await run('INSERT INTO dm_participants (thread_id, user_id) VALUES (?, ?)', [id, other_user_id]);

    const participants = await all(
      `SELECT u.id, u.name, u.avatar_url FROM dm_participants dp JOIN users u ON u.id = dp.user_id WHERE dp.thread_id = ?`,
      [id]
    );
    res.status(201).json({ id, workspace_id, participants });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DM Messages ───────────────────────────────────────────────────────────────

router.get('/:threadId', requireDmParticipant('threadId'), async (req: Request, res: Response) => {
  const messages = await all(
    `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
            t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id, t.task_key, t.task_number,
            (SELECT COUNT(id)::int FROM messages WHERE parent_message_id = m.id) as reply_count
     FROM messages m LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN tasks t ON t.id = m.linked_task_id
     WHERE m.dm_thread_id = ? AND m.parent_message_id IS NULL
     ORDER BY m.created_at ASC LIMIT 200`,
    [req.params.threadId]
  );
  res.json(await enrichMessages(messages));
});

router.post('/:threadId', requireDmParticipant('threadId'), async (req: Request, res: Response) => {
  try {
    const { content, linked_task_id, parent_message_id, importance } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    if (parent_message_id) {
      const parentMsg = await get<{ parent_message_id: string | null }>(
        'SELECT parent_message_id FROM messages WHERE id = ?', [parent_message_id]
      );
      if (parentMsg?.parent_message_id) {
        const grandparentMsg = await get<{ parent_message_id: string | null }>(
          'SELECT parent_message_id FROM messages WHERE id = ?', [parentMsg.parent_message_id]
        );
        if (grandparentMsg?.parent_message_id) {
          return res.status(400).json({ error: 'Cannot nest more than 2 levels deep in a thread' });
        }
      }
    }

    const id = uuidv4();
    const importanceVal = importance || 'normal';
    await run(
      'INSERT INTO messages (id, dm_thread_id, sender_id, content, linked_task_id, parent_message_id, importance) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, req.params.threadId, req.user.id, content, linked_task_id || null, parent_message_id || null, importanceVal]
    );

    const sender = await get('SELECT id, name, avatar_url FROM users WHERE id = ?', [req.user.id]);
    const message = {
      id, dm_thread_id: req.params.threadId, sender_id: req.user.id, content,
      linked_task_id: linked_task_id || null, created_at: new Date().toISOString(), sender,
      parent_message_id: parent_message_id || null, reply_count: 0,
      reactions: [], shared_message_id: null, shared_message: null,
      importance: importanceVal,
    };

    const participants = await all('SELECT user_id FROM dm_participants WHERE thread_id = ?', [req.params.threadId]);

    if (io) {
      if (parent_message_id) {
        const parentRow = await get<{ parent_message_id: string | null }>(
          'SELECT parent_message_id FROM messages WHERE id = ?', [parent_message_id]
        );
        const rootId = parentRow?.parent_message_id ?? parent_message_id;
        const threadParticipants = await all(
          `SELECT DISTINCT sender_id FROM messages WHERE id = ? OR parent_message_id = ?`, [rootId, rootId]
        );
        const notified = new Set<string>();
        threadParticipants.forEach(p => { io!.to(`user:${p.sender_id}`).emit('new_dm', message); notified.add(p.sender_id); });
        if (!notified.has(req.user!.id)) io.to(`user:${req.user.id}`).emit('new_dm', message);
      } else {
        io.to(`dm:${req.params.threadId}`).emit('new_dm', message);
      }
    }

    if (!parent_message_id) {
      for (const p of participants) {
        if (p.user_id !== req.user?.id) {
          const notifId = uuidv4();
          await run(
            'INSERT INTO notifications (id, user_id, type, reference_id, reference_type, message) VALUES (?, ?, ?, ?, ?, ?)',
            [notifId, p.user_id, 'dm', id, 'message', `${req.user?.name || 'A user'}: "${content.slice(0, 80)}"`]
          );
          if (io) io.to(`user:${p.user_id}`).emit('notification', { id: notifId, type: 'dm' });
        }
      }
    }

    res.status(201).json(message);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DM Thread replies ─────────────────────────────────────────────────────────

router.get('/:threadId/thread/:messageId', requireDmParticipant('threadId'), async (req: Request, res: Response) => {
  const depth1 = await all(
    `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
            t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id, t.task_key, t.task_number,
            (SELECT COUNT(id)::int FROM messages WHERE parent_message_id = m.id) as reply_count
     FROM messages m LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN tasks t ON t.id = m.linked_task_id
     WHERE m.dm_thread_id = ? AND m.parent_message_id = ?
     ORDER BY m.created_at ASC`,
    [req.params.threadId, req.params.messageId]
  );

  const depth1Ids = depth1.map((m: any) => m.id);
  let depth2: any[] = [];
  if (depth1Ids.length > 0) {
    const placeholders = depth1Ids.map(() => '?').join(',');
    depth2 = await all(
      `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
              t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id, t.task_key, t.task_number,
              0 as reply_count
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN tasks t ON t.id = m.linked_task_id
       WHERE m.dm_thread_id = ? AND m.parent_message_id IN (${placeholders})
       ORDER BY m.created_at ASC`,
      [req.params.threadId, ...depth1Ids]
    );
  }

  const all_msgs = [...depth1, ...depth2].sort((a: any, b: any) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  res.json(await enrichMessages(all_msgs));
});

export default router;
export { router as dmRouter };
