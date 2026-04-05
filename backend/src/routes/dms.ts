import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { all, get, run } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
let io: Server | undefined;

export const setIo = (socketIo: Server) => { io = socketIo; };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getReactionsForMessage(messageId: string) {
  const rows = all<{ emoji: string; user_id: string }>(
    `SELECT emoji, user_id FROM message_reactions WHERE message_id = ? ORDER BY created_at ASC`,
    [messageId]
  );
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.user_id);
  }
  return Object.entries(map).map(([emoji, users]) => ({ emoji, count: users.length, users }));
}

function getSharedMessagePreview(sharedMessageId: string | null | undefined) {
  if (!sharedMessageId) return null;
  const sm = get<any>(
    `SELECT m.id, m.content, m.created_at, m.channel_id, m.dm_thread_id, m.parent_message_id,
            u.name as sender_name, u.avatar_url as sender_avatar,
            c.name as channel_name
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     LEFT JOIN channels c ON c.id = m.channel_id
     WHERE m.id = ?`,
    [sharedMessageId]
  );
  if (!sm) return null;
  return {
    id: sm.id,
    content: sm.content,
    created_at: sm.created_at,
    sender_name: sm.sender_name,
    sender_avatar: sm.sender_avatar,
    channel_id: sm.channel_id ?? undefined,
    channel_name: sm.channel_name ?? undefined,
    dm_thread_id: sm.dm_thread_id ?? undefined,
    parent_message_id: sm.parent_message_id ?? undefined,
  };
}

function enrichDmMessage(m: any) {
  const reactions = getReactionsForMessage(m.id);
  const replyCount = m.reply_count ??
    (get<{ cnt: number }>(`SELECT COUNT(id) as cnt FROM messages WHERE parent_message_id = ?`, [m.id])?.cnt ?? 0);
  const shared_message = getSharedMessagePreview(m.shared_message_id);

  let linked_task = null;
  if (m.task_id) {
    const assignees = all(
      `SELECT u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`,
      [m.task_id]
    );
    const col = get('SELECT title FROM columns WHERE id = ?', [m.task_column_id]);
    linked_task = {
      id: m.task_id, title: m.task_title, priority: m.task_priority,
      column_title: col?.title || '', assignees
    };
  }

  return {
    id: m.id,
    dm_thread_id: m.dm_thread_id,
    sender_id: m.sender_id,
    content: m.content,
    linked_task_id: m.linked_task_id,
    linked_task,
    created_at: m.created_at,
    sender: { id: m.sender_id, name: m.sender_name, avatar_url: m.sender_avatar },
    parent_message_id: m.parent_message_id ?? null,
    reply_count: replyCount,
    reactions,
    shared_message_id: m.shared_message_id ?? null,
    shared_message,
    is_system: m.is_system ?? 0,
  };
}

// ── DM Threads ────────────────────────────────────────────────────────────────

router.get('/threads/:workspaceId', authMiddleware, (req: Request, res: Response) => {
  const threads = all(
    `SELECT dt.id, dt.workspace_id, dt.created_at FROM dm_threads dt
     JOIN dm_participants dp ON dt.id = dp.thread_id
     WHERE dp.user_id = ? AND dt.workspace_id = ?`,
    [req.user?.id, req.params.workspaceId]
  );

  const enriched = threads.map(t => {
    const participants = all(
      `SELECT u.id, u.name, u.avatar_url FROM dm_participants dp
       JOIN users u ON u.id = dp.user_id WHERE dp.thread_id = ?`,
      [t.id]
    );
    const lastMsg = get(
      `SELECT content, created_at FROM messages WHERE dm_thread_id = ? AND parent_message_id IS NULL ORDER BY created_at DESC LIMIT 1`,
      [t.id]
    );
    return { ...t, participants, last_message: lastMsg };
  });
  res.json(enriched);
});

router.post('/threads', authMiddleware, (req: Request, res: Response) => {
  try {
    const { workspace_id, other_user_id } = req.body;
    if (!workspace_id || !other_user_id) {
      return res.status(400).json({ error: 'workspace_id and other_user_id required' });
    }
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const existing = get(
      `SELECT dt.id FROM dm_threads dt
       JOIN dm_participants dp1 ON dt.id = dp1.thread_id AND dp1.user_id = ?
       JOIN dm_participants dp2 ON dt.id = dp2.thread_id AND dp2.user_id = ?
       WHERE dt.workspace_id = ?
       LIMIT 1`,
      [req.user.id, other_user_id, workspace_id]
    );
    if (existing) {
      const participants = all(
        `SELECT u.id, u.name, u.avatar_url FROM dm_participants dp JOIN users u ON u.id = dp.user_id WHERE dp.thread_id = ?`,
        [existing.id]
      );
      return res.json({ id: existing.id, workspace_id, participants });
    }

    const id = uuidv4();
    run('INSERT INTO dm_threads (id, workspace_id) VALUES (?, ?)', [id, workspace_id]);
    run('INSERT INTO dm_participants (thread_id, user_id) VALUES (?, ?)', [id, req.user.id]);
    run('INSERT INTO dm_participants (thread_id, user_id) VALUES (?, ?)', [id, other_user_id]);

    const participants = all(
      `SELECT u.id, u.name, u.avatar_url FROM dm_participants dp JOIN users u ON u.id = dp.user_id WHERE dp.thread_id = ?`,
      [id]
    );
    res.status(201).json({ id, workspace_id, participants });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DM Messages ───────────────────────────────────────────────────────────────

router.get('/:threadId', authMiddleware, (req: Request, res: Response) => {
  const messages = all(
    `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
            t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id,
            (SELECT COUNT(id) FROM messages WHERE parent_message_id = m.id) as reply_count
     FROM messages m JOIN users u ON u.id = m.sender_id
     LEFT JOIN tasks t ON t.id = m.linked_task_id
     WHERE m.dm_thread_id = ? AND m.parent_message_id IS NULL
     ORDER BY m.created_at ASC LIMIT 200`,
    [req.params.threadId]
  );
  res.json(messages.map(enrichDmMessage));
});

router.post('/:threadId', authMiddleware, (req: Request, res: Response) => {
  try {
    const { content, linked_task_id, parent_message_id } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    // Enforce max 2-level nesting: allow reply→reply but not reply→reply→reply
    if (parent_message_id) {
      const parentMsg = get<{ parent_message_id: string | null }>(
        'SELECT parent_message_id FROM messages WHERE id = ?',
        [parent_message_id]
      );
      if (parentMsg?.parent_message_id) {
        const grandparentMsg = get<{ parent_message_id: string | null }>(
          'SELECT parent_message_id FROM messages WHERE id = ?',
          [parentMsg.parent_message_id]
        );
        if (grandparentMsg?.parent_message_id) {
          return res.status(400).json({ error: 'Cannot nest more than 2 levels deep in a thread' });
        }
      }
    }

    const id = uuidv4();
    run(
      'INSERT INTO messages (id, dm_thread_id, sender_id, content, linked_task_id, parent_message_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.params.threadId, req.user.id, content, linked_task_id || null, parent_message_id || null]
    );

    const sender = get('SELECT id, name, avatar_url FROM users WHERE id = ?', [req.user.id]);
    const message = {
      id,
      dm_thread_id: req.params.threadId,
      sender_id: req.user.id,
      content,
      linked_task_id: linked_task_id || null,
      created_at: new Date().toISOString(),
      sender,
      parent_message_id: parent_message_id || null,
      reply_count: 0,
      reactions: [],
      shared_message_id: null,
      shared_message: null,
    };

    const participants = all(
      'SELECT user_id FROM dm_participants WHERE thread_id = ?',
      [req.params.threadId]
    );

    if (io) {
      if (parent_message_id) {
        // Walk up to find the root of the thread
        const parentRow = get<{ parent_message_id: string | null }>(
          'SELECT parent_message_id FROM messages WHERE id = ?',
          [parent_message_id]
        );
        const rootId = parentRow?.parent_message_id ?? parent_message_id;

        const threadParticipants = all(
          `SELECT DISTINCT sender_id FROM messages WHERE id = ? OR parent_message_id = ?`,
          [rootId, rootId]
        );
        const notified = new Set<string>();
        threadParticipants.forEach(p => {
          io!.to(`user:${p.sender_id}`).emit('new_dm', message);
          notified.add(p.sender_id);
        });
        if (!notified.has(req.user!.id)) {
          io.to(`user:${req.user.id}`).emit('new_dm', message);
        }
      } else {
        io.to(`dm:${req.params.threadId}`).emit('new_dm', message);
      }
    }

    // DM notifications for non-thread messages
    if (!parent_message_id) {
      participants.forEach(p => {
        if (p.user_id !== req.user?.id) {
          const notifId = uuidv4();
          run(
            'INSERT INTO notifications (id, user_id, type, reference_id, reference_type, message) VALUES (?, ?, ?, ?, ?, ?)',
            [notifId, p.user_id, 'dm', id, 'message', `${req.user?.name || 'A user'}: "${content.slice(0, 80)}"`]
          );
          if (io) io.to(`user:${p.user_id}`).emit('notification', { id: notifId, type: 'dm' });
        }
      });
    }

    res.status(201).json(message);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DM Thread replies ─────────────────────────────────────────────────────────

router.get('/:threadId/thread/:messageId', authMiddleware, (req: Request, res: Response) => {
  const depth1 = all(
    `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
            t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id,
            (SELECT COUNT(id) FROM messages WHERE parent_message_id = m.id) as reply_count
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     LEFT JOIN tasks t ON t.id = m.linked_task_id
     WHERE m.dm_thread_id = ? AND m.parent_message_id = ?
     ORDER BY m.created_at ASC`,
    [req.params.threadId, req.params.messageId]
  );

  const depth1Ids = depth1.map((m: any) => m.id);
  let depth2: any[] = [];
  if (depth1Ids.length > 0) {
    const placeholders = depth1Ids.map(() => '?').join(',');
    depth2 = all(
      `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
              t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id,
              0 as reply_count
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN tasks t ON t.id = m.linked_task_id
       WHERE m.dm_thread_id = ? AND m.parent_message_id IN (${placeholders})
       ORDER BY m.created_at ASC`,
      [req.params.threadId, ...depth1Ids]
    );
  }

  const all_msgs = [...depth1, ...depth2].sort((a: any, b: any) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  res.json(all_msgs.map(enrichDmMessage));
});

export default router;
export { router as dmRouter };
