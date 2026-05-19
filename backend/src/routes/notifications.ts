import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { all, get, run } from '../db';

const router = express.Router();
let io: Server | undefined;
export const setIo = (socketIo: Server) => { io = socketIo; };

router.get('/', async (req: Request, res: Response) => {
  const notifications = await all(
    "SELECT * FROM notifications WHERE user_id = ? AND workspace_id = ? AND type != 'dm' ORDER BY created_at DESC LIMIT 50",
    [req.user.id, req.workspaceId]
  );
  res.json(notifications);
});

router.patch('/read', async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (ids && Array.isArray(ids) && ids.length > 0) {
    for (const id of ids) {
      await run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, req.user.id]);
    }
  } else {
    await run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND workspace_id = ?', [req.user.id, req.workspaceId]);
  }
  res.json({ success: true });
});

// Send a priority alert to one or more recipients
router.post('/priority', async (req: Request, res: Response) => {
  try {
    const { recipient_ids, message } = req.body;
    const workspace_id = req.workspaceId!;
    if (!Array.isArray(recipient_ids) || recipient_ids.length === 0 || !message?.trim()) {
      return res.status(400).json({ error: 'recipient_ids and message required' });
    }

    const sender = await get<{ name: string; avatar_url: string }>(
      'SELECT name, avatar_url FROM users WHERE id = ?', [req.user.id]
    );

    const sendFeedback = async (feedbackMsg: string) => {
      if (!io) return;
      const fid = uuidv4();
      await run(
        `INSERT INTO notifications (id, user_id, type, message, workspace_id, is_read) VALUES (?, ?, 'system', ?, ?, 0)`,
        [fid, req.user.id, feedbackMsg, workspace_id]
      );
      io.to(`user:${req.user.id}`).emit('notification', { id: fid, type: 'system', message: feedbackMsg, workspace_id });
    };

    const created: string[] = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    for (const recipientId of recipient_ids) {
      if (recipientId === req.user.id) continue;

      const recipientUser = await get<{ name: string }>('SELECT name FROM users WHERE id = ?', [recipientId]);
      const recipientName = recipientUser?.name ?? 'that user';

      // Guard A — dedup: sender already has a pending unresolved alert to this recipient in this workspace
      const existing = await get(
        `SELECT id FROM notifications WHERE user_id = ? AND type = 'priority_alert' AND is_resolved = 0 AND reference_id = ? AND workspace_id = ? LIMIT 1`,
        [recipientId, req.user.id, workspace_id]
      );
      if (existing) {
        const reason = `Alert to ${recipientName} skipped — your previous alert is still pending acknowledgment.`;
        skipped.push({ name: recipientName, reason });
        await sendFeedback(reason);
        continue;
      }

      // Guard B — cap: recipient already has 5+ unresolved priority alerts in this workspace
      const countRow = await get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND type = 'priority_alert' AND is_resolved = 0 AND workspace_id = ?`,
        [recipientId, workspace_id]
      );
      if ((countRow?.cnt ?? 0) >= 5) {
        const reason = `Alert to ${recipientName} not delivered — their alert queue is full (5 pending).`;
        skipped.push({ name: recipientName, reason });
        await sendFeedback(reason);
        continue;
      }

      const id = uuidv4();
      await run(
        `INSERT INTO notifications (id, user_id, type, message, reference_id, reference_type, sender_name, sender_avatar, workspace_id, is_read, is_resolved)
         VALUES (?, ?, 'priority_alert', ?, ?, 'user', ?, ?, ?, 0, 0)`,
        [id, recipientId, message.trim(), req.user.id, sender?.name ?? 'A user', sender?.avatar_url ?? '', workspace_id]
      );
      const payload = {
        id, type: 'priority_alert', message: message.trim(),
        sender_name: sender?.name ?? 'A user', sender_avatar: sender?.avatar_url ?? '',
        created_at: new Date().toISOString(), reference_id: req.user.id,
        reference_type: 'user', workspace_id, is_read: 0, is_resolved: 0,
      };
      if (io) io.to(`user:${recipientId}`).emit('priority_alert', payload);
      created.push(id);
    }

    res.status(201).json({ sent: created.length, skipped });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Resolve a priority alert (recipient acknowledges it)
router.patch('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const notif = await get<{ reference_id: string; workspace_id: string }>(
      "SELECT reference_id, workspace_id FROM notifications WHERE id = ? AND user_id = ? AND type = 'priority_alert'",
      [req.params.id, req.user.id]
    );
    if (notif?.reference_id) {
      await run(
        "UPDATE notifications SET is_resolved = 1, is_read = 1 WHERE user_id = ? AND type = 'priority_alert' AND reference_id = ? AND workspace_id = ? AND is_resolved = 0",
        [req.user.id, notif.reference_id, notif.workspace_id]
      );
    } else {
      await run(
        'UPDATE notifications SET is_resolved = 1, is_read = 1 WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.id]
      );
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
