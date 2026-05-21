import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import * as notifService from '../services/notificationService';

let io: Server | undefined;
export const setIo = (s: Server) => { io = s; };

export async function list(req: Request, res: Response) {
  const notifications = await notifService.getNotifications(req.user.id, req.workspaceId!);
  res.json(notifications);
}

export async function markRead(req: Request, res: Response) {
  const { ids } = req.body;
  if (ids && Array.isArray(ids) && ids.length > 0) {
    await notifService.markRead(ids, req.user.id);
  } else {
    await notifService.markAllRead(req.user.id, req.workspaceId!);
  }
  res.json({ success: true });
}

export async function sendPriorityAlert(req: Request, res: Response) {
  try {
    const { recipient_ids, message } = req.body;
    const workspaceId = req.workspaceId!;
    if (!Array.isArray(recipient_ids) || recipient_ids.length === 0 || !message?.trim()) {
      return res.status(400).json({ error: 'recipient_ids and message required' });
    }

    const sender = await notifService.getSenderInfo(req.user.id);

    const sendFeedback = async (feedbackMsg: string) => {
      if (!io) return;
      const fid = uuidv4();
      await notifService.createNotification({ id: fid, user_id: req.user.id, type: 'system', message: feedbackMsg, workspace_id: workspaceId, is_read: 0 });
      io.to(`user:${req.user.id}`).emit('notification', { id: fid, type: 'system', message: feedbackMsg, workspace_id: workspaceId });
    };

    const created: string[] = [];
    for (const recipientId of recipient_ids) {
      if (recipientId === req.user.id) continue;

      const existing = await notifService.getPendingAlertToRecipient(recipientId, req.user.id, workspaceId);
      if (existing) {
        const name = (await notifService.getSenderInfo(recipientId))?.name ?? 'that user';
        await sendFeedback(`Alert to ${name} skipped — your previous alert is still pending acknowledgment.`);
        continue;
      }

      const count = await notifService.countUnresolvedAlerts(recipientId, workspaceId);
      if (count >= 5) {
        const name = (await notifService.getSenderInfo(recipientId))?.name ?? 'that user';
        await sendFeedback(`Alert to ${name} not delivered — their alert queue is full (5 pending).`);
        continue;
      }

      const id = uuidv4();
      const payload = {
        id, type: 'priority_alert', message: message.trim(),
        sender_name: sender?.name ?? 'A user', sender_avatar: sender?.avatar_url ?? '',
        created_at: new Date().toISOString(), reference_id: req.user.id,
        reference_type: 'user', workspace_id: workspaceId, is_read: 0, is_resolved: 0,
      };
      await notifService.createNotification({
        id, user_id: recipientId, type: 'priority_alert', message: message.trim(),
        sender_name: sender?.name ?? 'A user', sender_avatar: sender?.avatar_url ?? '',
        reference_id: req.user.id, reference_type: 'user',
        workspace_id: workspaceId, is_read: 0, is_resolved: 0,
      });
      if (io) io.to(`user:${recipientId}`).emit('priority_alert', payload);
      created.push(id);
    }

    res.status(201).json({ sent: created.length });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function resolveAlert(req: Request, res: Response) {
  try {
    const notifications = await notifService.getNotifications(req.user.id, req.workspaceId!);
    const notif = notifications.find(n => n.id === req.params.id && n.type === 'priority_alert');

    if (notif?.reference_id) {
      await notifService.resolveAlertsByReference(req.user.id, notif.reference_id, notif.workspace_id!);
    } else {
      await notifService.resolveAlertById(req.params.id, req.user.id);
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
