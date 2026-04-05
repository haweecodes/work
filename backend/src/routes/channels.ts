import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { all, get, run } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
let io: Server | undefined;

export const setIo = (socketIo: Server) => { io = socketIo; };

// ── Helper: aggregate reactions ──────────────────────────────────────────────

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

// ── Helper: build shared_message preview ─────────────────────────────────────

function getSharedMessagePreview(sharedMessageId: string | null | undefined) {
  if (!sharedMessageId) return null;
  const sm = get<any>(
    `SELECT m.id, m.content, m.created_at, m.channel_id, m.dm_thread_id, m.parent_message_id,
            u.name as sender_name, u.avatar_url as sender_avatar,
            c.name as channel_name
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
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

// ── Helper: enrich a raw message row ─────────────────────────────────────────

function enrichMessage(m: any) {
  const reactions = getReactionsForMessage(m.id);
  const replyCount = m.reply_count ?? (m.id
    ? (get<{ cnt: number }>(`SELECT COUNT(id) as cnt FROM messages WHERE parent_message_id = ?`, [m.id])?.cnt ?? 0)
    : 0);

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

  const shared_message = getSharedMessagePreview(m.shared_message_id);

  return {
    id: m.id,
    channel_id: m.channel_id,
    dm_thread_id: m.dm_thread_id,
    sender_id: m.sender_id,
    content: m.content,
    created_at: m.created_at,
    linked_task_id: m.linked_task_id,
    linked_task,
    sender: { id: m.sender_id, name: m.sender_name, avatar_url: m.sender_avatar },
    parent_message_id: m.parent_message_id ?? null,
    reply_count: replyCount,
    reactions,
    shared_message_id: m.shared_message_id ?? null,
    shared_message,
    is_system: m.is_system ?? 0,
  };
}

// ── Channels CRUD ─────────────────────────────────────────────────────────────

router.get('/:workspaceId', authMiddleware, (req: Request, res: Response) => {
  const channels = all(
    `SELECT c.* FROM channels c
     JOIN channel_members cm ON c.id = cm.channel_id
     WHERE c.workspace_id = ? AND cm.user_id = ?
     ORDER BY c.created_at ASC`,
    [req.params.workspaceId, req.user?.id]
  );
  res.json(channels);
});

router.post('/', authMiddleware, (req: Request, res: Response) => {
  try {
    const { workspace_id, name, is_private } = req.body;
    if (!workspace_id || !name) {
      return res.status(400).json({ error: 'workspace_id and name are required' });
    }

    const id = uuidv4();
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const isPrivate = is_private ? 1 : 0;
    run('INSERT INTO channels (id, workspace_id, name, is_private, created_by) VALUES (?, ?, ?, ?, ?)',
      [id, workspace_id, name.toLowerCase().replace(/\s+/g, '-'), isPrivate, req.user.id]);

    if (isPrivate) {
      run('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)', [id, req.user.id]);
    } else {
      const members = all('SELECT user_id FROM workspace_members WHERE workspace_id = ?', [workspace_id]);
      members.forEach((m: any) => {
        run('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)', [id, m.user_id]);
      });
    }

    const channel = get('SELECT * FROM channels WHERE id = ?', [id]);

    if (io) {
      if (isPrivate) {
        io.to(`user:${req.user.id}`).emit('channel_created', channel);
      } else {
        const members = all('SELECT user_id FROM workspace_members WHERE workspace_id = ?', [workspace_id]) as any[];
        members.forEach((m: any) => {
          io!.to(`user:${m.user_id}`).emit('channel_created', channel);
        });
      }
    }

    res.status(201).json(channel);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:channelId/archive', authMiddleware, (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const channel = get('SELECT * FROM channels WHERE id = ?', [req.params.channelId]) as any;
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const workspace = get('SELECT owner_id FROM workspaces WHERE id = ?', [channel.workspace_id]) as any;
    const isOwner = workspace?.owner_id === req.user.id;
    const isCreator = channel.created_by === req.user.id;
    if (!isOwner && !isCreator) return res.status(403).json({ error: 'Not allowed' });

    run('UPDATE channels SET is_archived = 1 WHERE id = ?', [req.params.channelId]);

    if (io) {
      const members = all('SELECT user_id FROM channel_members WHERE channel_id = ?', [req.params.channelId]) as any[];
      members.forEach((m: any) => {
        io!.to(`user:${m.user_id}`).emit('channel_archived', { channelId: req.params.channelId });
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────

router.get('/messages/:channelId', authMiddleware, (req: Request, res: Response) => {
  const messages = all(
    `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
            t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id,
            (SELECT COUNT(id) FROM messages WHERE parent_message_id = m.id) as reply_count
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN tasks t ON t.id = m.linked_task_id
     WHERE m.channel_id = ? AND m.parent_message_id IS NULL
     ORDER BY m.created_at ASC
     LIMIT 200`,
    [req.params.channelId]
  );

  res.json(messages.map(enrichMessage));
});

router.post('/messages', authMiddleware, (req: Request, res: Response) => {
  try {
    const { channel_id, content, linked_task_id, parent_message_id } = req.body;
    if (!channel_id || !content) {
      return res.status(400).json({ error: 'channel_id and content required' });
    }
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    // Enforce max 2-level nesting: allow reply→reply but not reply→reply→reply
    if (parent_message_id) {
      const parentMsg = get<{ parent_message_id: string | null }>(
        'SELECT parent_message_id FROM messages WHERE id = ?',
        [parent_message_id]
      );
      if (parentMsg?.parent_message_id) {
        // Parent is depth-1. Check if its parent is also a reply (would create depth-3).
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
    run('INSERT INTO messages (id, channel_id, sender_id, content, linked_task_id, parent_message_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, channel_id, req.user.id, content, linked_task_id || null, parent_message_id || null]);

    const sender = get('SELECT id, name, avatar_url FROM users WHERE id = ?', [req.user.id]);
    const message = {
      id, channel_id, sender_id: req.user.id, content, linked_task_id: linked_task_id || null,
      created_at: new Date().toISOString(), sender, linked_task: null,
      parent_message_id: parent_message_id || null,
      reply_count: 0, reactions: [], shared_message_id: null, shared_message: null
    };

    // Mentions
    const mentions = [...content.matchAll(/@(\w+)/g)].map((m: any) => m[1]);
    if (mentions.length > 0) {
      const channel = get('SELECT workspace_id FROM channels WHERE id = ?', [channel_id]);
      mentions.forEach((username: string) => {
        const mentionedUser = get(
          `SELECT u.id FROM users u JOIN workspace_members wm ON u.id = wm.user_id
           WHERE wm.workspace_id = ? AND u.name = ?`,
          [channel?.workspace_id, username]
        );
        if (mentionedUser && mentionedUser.id !== req.user?.id) {
          const notifId = uuidv4();
          run(
            'INSERT INTO notifications (id, user_id, type, reference_id, reference_type, message) VALUES (?, ?, ?, ?, ?, ?)',
            [notifId, mentionedUser.id, 'mention', id, 'message', `${req.user?.name || 'A user'} mentioned you: "${content.slice(0, 80)}"`]
          );
          if (io) io.to(`user:${mentionedUser.id}`).emit('notification', { id: notifId, type: 'mention' });
        }
      });
    }

    if (io) {
      if (parent_message_id) {
        // Walk up to find the root of the thread
        const parentRow = get<{ parent_message_id: string | null }>(
          'SELECT parent_message_id FROM messages WHERE id = ?',
          [parent_message_id]
        );
        // rootId is either the direct parent (if parent is a root message)
        // or the grandparent (if parent is a depth-1 reply)
        const rootId = parentRow?.parent_message_id ?? parent_message_id;

        // Notify everyone who has participated in the whole thread tree
        const participants = all(
          `SELECT DISTINCT sender_id FROM messages WHERE id = ? OR parent_message_id = ?`,
          [rootId, rootId]
        );
        const notified = new Set<string>();
        participants.forEach(p => {
          io!.to(`user:${p.sender_id}`).emit('new_message', message);
          notified.add(p.sender_id);
        });
        // Always notify the sender
        if (!notified.has(req.user.id)) {
          io.to(`user:${req.user.id}`).emit('new_message', message);
        }
      } else {
        io.to(`channel:${channel_id}`).emit('new_message', message);
      }
    }

    res.status(201).json(message);
  } catch (err: any) {
    console.error('FAILED TO POST MESSAGE:', err, req.body);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ── Thread replies ────────────────────────────────────────────────────────────
// Returns all replies (depth 1 AND depth 2) for a root message, flat list

router.get('/messages/:channelId/thread/:messageId', authMiddleware, (req: Request, res: Response) => {
  // Depth-1 replies (direct children of root)
  const depth1 = all(
    `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
            t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id,
            (SELECT COUNT(id) FROM messages WHERE parent_message_id = m.id) as reply_count
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN tasks t ON t.id = m.linked_task_id
     WHERE m.channel_id = ? AND m.parent_message_id = ?
     ORDER BY m.created_at ASC`,
    [req.params.channelId, req.params.messageId]
  );

  // Depth-2 replies (children of depth-1)
  const depth1Ids = depth1.map((m: any) => m.id);
  let depth2: any[] = [];
  if (depth1Ids.length > 0) {
    const placeholders = depth1Ids.map(() => '?').join(',');
    depth2 = all(
      `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
              t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id,
              0 as reply_count
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN tasks t ON t.id = m.linked_task_id
       WHERE m.channel_id = ? AND m.parent_message_id IN (${placeholders})
       ORDER BY m.created_at ASC`,
      [req.params.channelId, ...depth1Ids]
    );
  }

  // Merge and sort by created_at
  const all_msgs = [...depth1, ...depth2].sort((a: any, b: any) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  res.json(all_msgs.map(enrichMessage));
});

// ── Share a message ───────────────────────────────────────────────────────────

router.post('/messages/:messageId/share', authMiddleware, (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { target_channel_id, target_dm_thread_id, comment } = req.body;
    if (!target_channel_id && !target_dm_thread_id) {
      return res.status(400).json({ error: 'target_channel_id or target_dm_thread_id required' });
    }

    const original = get<any>(
      `SELECT m.*, c.is_private as channel_is_private
       FROM messages m
       LEFT JOIN channels c ON c.id = m.channel_id
       WHERE m.id = ?`,
      [req.params.messageId]
    );
    if (!original) return res.status(404).json({ error: 'Message not found' });

    // ── Privacy check ─────────────────────────────────────────────────────────
    if (original.channel_id && original.channel_is_private) {
      if (target_channel_id) {
        // Cannot share a private channel message to a public channel
        const targetCh = get<{ is_private: number }>(
          'SELECT is_private FROM channels WHERE id = ?', [target_channel_id]
        );
        if (!targetCh?.is_private) {
          return res.status(403).json({
            error: 'Cannot share a private channel message to a public channel.',
          });
        }
        // Both channels are private — make sure the sharer is a member of the source channel
        const inSource = get(
          'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
          [original.channel_id, req.user.id]
        );
        if (!inSource) {
          return res.status(403).json({ error: 'You are not a member of the source private channel.' });
        }
      } else if (target_dm_thread_id) {
        // Sharing to a DM: recipient must also be a member of the source private channel
        const dmPeople = all<{ user_id: string }>(
          'SELECT user_id FROM dm_participants WHERE thread_id = ?', [target_dm_thread_id]
        );
        const recipient = dmPeople.find(p => p.user_id !== req.user!.id);
        if (recipient) {
          const recipientInChannel = get(
            'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
            [original.channel_id, recipient.user_id]
          );
          if (!recipientInChannel) {
            return res.status(403).json({
              error: 'The recipient is not a member of the private channel this message belongs to.',
            });
          }
        }
      }
    }

    const id = uuidv4();
    const msgContent = comment?.trim() || '';

    if (target_channel_id) {
      run(
        'INSERT INTO messages (id, channel_id, sender_id, content, shared_message_id) VALUES (?, ?, ?, ?, ?)',
        [id, target_channel_id, req.user.id, msgContent, req.params.messageId]
      );
    } else {
      run(
        'INSERT INTO messages (id, dm_thread_id, sender_id, content, shared_message_id) VALUES (?, ?, ?, ?, ?)',
        [id, target_dm_thread_id, req.user.id, msgContent, req.params.messageId]
      );
    }

    const sender = get('SELECT id, name, avatar_url FROM users WHERE id = ?', [req.user.id]);
    const shared_message = getSharedMessagePreview(String(req.params.messageId));
    const message = {
      id,
      channel_id: target_channel_id || null,
      dm_thread_id: target_dm_thread_id || null,
      sender_id: req.user.id,
      content: msgContent,
      created_at: new Date().toISOString(),
      sender,
      parent_message_id: null,
      reply_count: 0,
      reactions: [],
      shared_message_id: req.params.messageId,
      shared_message,
    };

    if (io) {
      if (target_channel_id) {
        io.to(`channel:${target_channel_id}`).emit('new_message', message);
      } else if (target_dm_thread_id) {
        io.to(`dm:${target_dm_thread_id}`).emit('new_dm', message);
      }
    }

    res.status(201).json(message);
  } catch (err: any) {
    console.error('SHARE ERROR:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ── Reactions ─────────────────────────────────────────────────────────────────

router.get('/messages/:messageId/reactions', authMiddleware, (req: Request, res: Response) => {
  res.json(getReactionsForMessage(String(req.params.messageId)));
});

router.post('/messages/:messageId/reactions', authMiddleware, (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const messageId = String(req.params.messageId);
    const emoji = String(req.body.emoji ?? '');
    if (!emoji) return res.status(400).json({ error: 'emoji is required' });

    const msg = get<{ channel_id: string | null; dm_thread_id: string | null }>(
      'SELECT channel_id, dm_thread_id FROM messages WHERE id = ?',
      [messageId]
    );
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const existing = get(
      'SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [messageId, req.user.id, emoji]
    );

    if (existing) {
      run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
        [messageId, req.user.id, emoji]);
    } else {
      run('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
        [messageId, req.user.id, emoji]);
    }

    const reactions = getReactionsForMessage(messageId);

    if (io) {
      if (msg.channel_id) {
        io.to(`channel:${msg.channel_id}`).emit('reaction_updated', { messageId, reactions });
      } else if (msg.dm_thread_id) {
        io.to(`dm:${msg.dm_thread_id}`).emit('reaction_updated', { messageId, reactions });
      }
    }

    res.json(reactions);
  } catch (err: any) {
    console.error('REACTION ERROR:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

export default router;
