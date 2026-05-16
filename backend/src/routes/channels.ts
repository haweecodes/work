import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { all, get, run, runTransaction } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireChannelMember } from '../middleware/workspace';
import { getReactionsForMessage, getSharedMessagePreview, enrichMessages } from '../lib/messageEnrich';

const router = express.Router();
let io: Server | undefined;

export const setIo = (socketIo: Server) => { io = socketIo; };


// ── Channels CRUD ─────────────────────────────────────────────────────────────

router.get('/:workspaceId', authMiddleware, async (req: Request, res: Response) => {
  const channels = await all(
    `SELECT c.* FROM channels c
     JOIN channel_members cm ON c.id = cm.channel_id
     WHERE c.workspace_id = ? AND cm.user_id = ?
     ORDER BY c.created_at ASC`,
    [req.params.workspaceId, req.user?.id]
  );
  res.json(channels);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, is_private } = req.body;
    const workspace_id = req.workspaceId!;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const id = uuidv4();

    const isPrivate = is_private ? 1 : 0;
    const channelName = name.toLowerCase().replace(/\s+/g, '-');

    if (isPrivate) {
      await runTransaction([
        { query: 'INSERT INTO channels (id, workspace_id, name, is_private, created_by) VALUES (?, ?, ?, ?, ?)',
          params: [id, workspace_id, channelName, isPrivate, req.user.id] },
        { query: 'INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)',
          params: [id, req.user.id] },
      ]);
    } else {
      const members = await all<{ user_id: string }>('SELECT user_id FROM workspace_members WHERE workspace_id = ?', [workspace_id]);
      const vals = members.map(() => '(?, ?)').join(', ');
      await runTransaction([
        { query: 'INSERT INTO channels (id, workspace_id, name, is_private, created_by) VALUES (?, ?, ?, ?, ?)',
          params: [id, workspace_id, channelName, isPrivate, req.user.id] },
        ...(members.length > 0 ? [{
          query: `INSERT INTO channel_members (channel_id, user_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
          params: members.flatMap(m => [id, m.user_id]),
        }] : []),
      ]);
    }

    const channel = await get('SELECT * FROM channels WHERE id = ?', [id]);

    if (io) {
      if (isPrivate) {
        io.to(`user:${req.user.id}`).emit('channel_created', channel);
      } else {
        const members = await all<{ user_id: string }>('SELECT user_id FROM workspace_members WHERE workspace_id = ?', [workspace_id]);
        members.forEach(m => io!.to(`user:${m.user_id}`).emit('channel_created', channel));
      }
    }

    res.status(201).json(channel);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:channelId/archive', authMiddleware, async (req: Request, res: Response) => {
  try {
    const channel = await get('SELECT * FROM channels WHERE id = ? AND workspace_id = ?', [req.params.channelId, req.workspaceId]) as any;
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const workspace = await get('SELECT owner_id FROM workspaces WHERE id = ?', [channel.workspace_id]) as any;
    const isOwner = workspace?.owner_id === req.user.id;
    const isCreator = channel.created_by === req.user.id;
    if (!isOwner && !isCreator) return res.status(403).json({ error: 'Not allowed' });

    await run('UPDATE channels SET is_archived = 1 WHERE id = ?', [req.params.channelId]);

    if (io) {
      const members = await all('SELECT user_id FROM channel_members WHERE channel_id = ?', [req.params.channelId]) as any[];
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

router.get('/messages/:channelId', authMiddleware, requireChannelMember('channelId'), async (req: Request, res: Response) => {
  const messages = await all(
    `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
            t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id, t.task_key, t.task_number,
            (SELECT COUNT(id)::int FROM messages WHERE parent_message_id = m.id) as reply_count
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN tasks t ON t.id = m.linked_task_id
     WHERE m.channel_id = ? AND m.parent_message_id IS NULL
     ORDER BY m.created_at ASC
     LIMIT 200`,
    [req.params.channelId]
  );

  res.json(await enrichMessages(messages));
});

router.post('/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { channel_id, content, linked_task_id, parent_message_id, importance, mention_priorities } = req.body;
    if (!channel_id || !content) {
      return res.status(400).json({ error: 'channel_id and content required' });
    }

    // Guard: sender must be a member of the target channel
    const isMember = await get(
      'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
      [channel_id, req.user.id]
    );
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this channel' });

    // Enforce max 2-level nesting
    if (parent_message_id) {
      const parentMsg = await get<{ parent_message_id: string | null }>(
        'SELECT parent_message_id FROM messages WHERE id = ?',
        [parent_message_id]
      );
      if (parentMsg?.parent_message_id) {
        const grandparentMsg = await get<{ parent_message_id: string | null }>(
          'SELECT parent_message_id FROM messages WHERE id = ?',
          [parentMsg.parent_message_id]
        );
        if (grandparentMsg?.parent_message_id) {
          return res.status(400).json({ error: 'Cannot nest more than 2 levels deep in a thread' });
        }
      }
    }

    const id = uuidv4();
    const importanceVal = importance || 'normal';
    const mentionPrioritiesJson = mention_priorities ? JSON.stringify(mention_priorities) : null;
    await run(
      'INSERT INTO messages (id, channel_id, sender_id, content, linked_task_id, parent_message_id, importance, mention_priorities) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, channel_id, req.user.id, content, linked_task_id || null, parent_message_id || null, importanceVal, mentionPrioritiesJson]
    );

    const sender = await get('SELECT id, name, avatar_url FROM users WHERE id = ?', [req.user.id]);
    const message = {
      id, channel_id, sender_id: req.user.id, content, linked_task_id: linked_task_id || null,
      created_at: new Date().toISOString(), sender, linked_task: null,
      parent_message_id: parent_message_id || null,
      reply_count: 0, reactions: [], shared_message_id: null, shared_message: null,
      importance: importanceVal,
      mention_priorities: mention_priorities ?? [],
    };

    // Mentions — match full member names (handles multi-word names like "John Smith")
    if (content.includes('@')) {
      const channel = await get('SELECT workspace_id FROM channels WHERE id = ?', [channel_id]);
      const workspaceMembers = await all<{ id: string; name: string }>(
        `SELECT u.id, u.name FROM users u JOIN workspace_members wm ON u.id = wm.user_id WHERE wm.workspace_id = ?`,
        [channel?.workspace_id]
      );
      for (const member of workspaceMembers) {
        if (member.id === req.user?.id) continue;
        if (!content.includes(`@${member.name}`)) continue;
        const notifId = uuidv4();
        const notifMsg = `${req.user?.name || 'A user'} mentioned you: "${content.slice(0, 80)}"`;
        const mentionPriority = (mention_priorities as Array<{name: string; userId: string; priority: string}> | undefined)
          ?.find(mp => mp.name.toLowerCase() === member.name.toLowerCase())?.priority ?? 'normal';
        await run(
          'INSERT INTO notifications (id, user_id, type, reference_id, reference_type, message, priority) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [notifId, member.id, 'mention', channel_id, 'channel', notifMsg, mentionPriority]
        );
        if (io) io.to(`user:${member.id}`).emit('notification', { id: notifId, type: 'mention', message: notifMsg, reference_id: channel_id, reference_type: 'channel', priority: mentionPriority });
      }
    }

    if (io) {
      if (parent_message_id) {
        const parentRow = await get<{ parent_message_id: string | null }>(
          'SELECT parent_message_id FROM messages WHERE id = ?',
          [parent_message_id]
        );
        const rootId = parentRow?.parent_message_id ?? parent_message_id;

        const participants = await all(
          `SELECT DISTINCT sender_id FROM messages WHERE id = ? OR parent_message_id = ?`,
          [rootId, rootId]
        );
        const notified = new Set<string>();
        participants.forEach(p => {
          io!.to(`user:${p.sender_id}`).emit('new_message', message);
          notified.add(p.sender_id);
        });
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

router.get('/messages/:channelId/thread/:messageId', authMiddleware, requireChannelMember('channelId'), async (req: Request, res: Response) => {
  const depth1 = await all(
    `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
            t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id, t.task_key, t.task_number,
            (SELECT COUNT(id)::int FROM messages WHERE parent_message_id = m.id) as reply_count
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN tasks t ON t.id = m.linked_task_id
     WHERE m.channel_id = ? AND m.parent_message_id = ?
     ORDER BY m.created_at ASC`,
    [req.params.channelId, req.params.messageId]
  );

  const depth1Ids = depth1.map((m: any) => m.id);
  let depth2: any[] = [];
  if (depth1Ids.length > 0) {
    const placeholders = depth1Ids.map(() => '?').join(',');
    depth2 = await all(
      `SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar,
              t.id as task_id, t.title as task_title, t.priority as task_priority, t.column_id as task_column_id, t.task_key, t.task_number,
              0 as reply_count
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN tasks t ON t.id = m.linked_task_id
       WHERE m.channel_id = ? AND m.parent_message_id IN (${placeholders})
       ORDER BY m.created_at ASC`,
      [req.params.channelId, ...depth1Ids]
    );
  }

  const all_msgs = [...depth1, ...depth2].sort((a: any, b: any) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  res.json(await enrichMessages(all_msgs));
});

// ── Share a message ───────────────────────────────────────────────────────────

router.post('/messages/:messageId/share', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { target_channel_id, target_dm_thread_id, comment } = req.body;
    if (!target_channel_id && !target_dm_thread_id) {
      return res.status(400).json({ error: 'target_channel_id or target_dm_thread_id required' });
    }

    const original = await get<any>(
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
        const targetCh = await get<{ is_private: number }>(
          'SELECT is_private FROM channels WHERE id = ?', [target_channel_id]
        );
        if (!targetCh?.is_private) {
          return res.status(403).json({
            error: 'Cannot share a private channel message to a public channel.',
          });
        }
        const inSource = await get(
          'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
          [original.channel_id, req.user.id]
        );
        if (!inSource) {
          return res.status(403).json({ error: 'You are not a member of the source private channel.' });
        }
      } else if (target_dm_thread_id) {
        const dmPeople = await all<{ user_id: string }>(
          'SELECT user_id FROM dm_participants WHERE thread_id = ?', [target_dm_thread_id]
        );
        const recipient = dmPeople.find(p => p.user_id !== req.user!.id);
        if (recipient) {
          const recipientInChannel = await get(
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

    // Verify user is a member of the destination before writing
    if (target_channel_id) {
      const inTarget = await get(
        'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
        [target_channel_id, req.user.id]
      );
      if (!inTarget) return res.status(403).json({ error: 'You are not a member of the target channel' });
    } else if (target_dm_thread_id) {
      const inTarget = await get(
        'SELECT 1 FROM dm_participants WHERE thread_id = ? AND user_id = ?',
        [target_dm_thread_id, req.user.id]
      );
      if (!inTarget) return res.status(403).json({ error: 'You are not a participant in the target conversation' });
    }

    const id = uuidv4();
    const msgContent = comment?.trim() || '';

    if (target_channel_id) {
      await run(
        'INSERT INTO messages (id, channel_id, sender_id, content, shared_message_id) VALUES (?, ?, ?, ?, ?)',
        [id, target_channel_id, req.user.id, msgContent, req.params.messageId]
      );
    } else {
      await run(
        'INSERT INTO messages (id, dm_thread_id, sender_id, content, shared_message_id) VALUES (?, ?, ?, ?, ?)',
        [id, target_dm_thread_id, req.user.id, msgContent, req.params.messageId]
      );
    }

    const sender = await get('SELECT id, name, avatar_url FROM users WHERE id = ?', [req.user.id]);
    const shared_message = await getSharedMessagePreview(String(req.params.messageId));
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

// ── Message edit / delete ────────────────────────────────────────────────────

router.patch('/messages/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });

    const msg = await get<any>('SELECT * FROM messages WHERE id = ?', [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
    if (msg.is_system) return res.status(403).json({ error: 'Cannot edit system messages' });

    const trimmed = content.trim();
    await run('UPDATE messages SET content = ?, edited_at = NOW() WHERE id = ?', [trimmed, req.params.id]);

    const editedAt = new Date().toISOString();
    const payload = { messageId: req.params.id, content: trimmed, editedAt };
    if (io) {
      const room = msg.channel_id ? `channel:${msg.channel_id}` : `dm:${msg.dm_thread_id}`;
      io.to(room).emit('message_updated', payload);
    }
    res.json({ success: true, ...payload });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/messages/:id', authMiddleware, async (req: Request, res: Response) => {
  try {

    const msg = await get<any>('SELECT * FROM messages WHERE id = ?', [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
    if (msg.is_system) return res.status(403).json({ error: 'Cannot delete system messages' });

    await run('DELETE FROM message_reactions WHERE message_id = ?', [req.params.id]);
    await run('DELETE FROM messages WHERE id = ?', [req.params.id]);

    const payload = { messageId: req.params.id };
    if (io) {
      const room = msg.channel_id ? `channel:${msg.channel_id}` : `dm:${msg.dm_thread_id}`;
      io.to(room).emit('message_deleted', payload);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Reactions ─────────────────────────────────────────────────────────────────

router.get('/messages/:messageId/reactions', authMiddleware, async (req: Request, res: Response) => {
  res.json(await getReactionsForMessage(String(req.params.messageId)));
});

router.post('/messages/:messageId/reactions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const messageId = String(req.params.messageId);
    const emoji = String(req.body.emoji ?? '');
    if (!emoji) return res.status(400).json({ error: 'emoji is required' });

    const msg = await get<{ channel_id: string | null; dm_thread_id: string | null }>(
      'SELECT channel_id, dm_thread_id FROM messages WHERE id = ?',
      [messageId]
    );
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    // Verify user belongs to the room containing this message
    if (msg.channel_id) {
      const isMember = await get(
        'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
        [msg.channel_id, req.user.id]
      );
      if (!isMember) return res.status(403).json({ error: 'You are not a member of this channel' });
    } else if (msg.dm_thread_id) {
      const isParticipant = await get(
        'SELECT 1 FROM dm_participants WHERE thread_id = ? AND user_id = ?',
        [msg.dm_thread_id, req.user.id]
      );
      if (!isParticipant) return res.status(403).json({ error: 'You are not a participant in this conversation' });
    }

    const existing = await get(
      'SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [messageId, req.user.id, emoji]
    );

    if (existing) {
      await run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
        [messageId, req.user.id, emoji]);
    } else {
      await run('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
        [messageId, req.user.id, emoji]);
    }

    const reactions = await getReactionsForMessage(messageId);

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
