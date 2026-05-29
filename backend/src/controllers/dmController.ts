import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import * as dmService from '../services/dmService';
import * as notifService from '../services/notificationService';

let io: Server | undefined;
export const setIo = (s: Server) => { io = s; };

export async function listThreads(req: Request, res: Response) {
  const threads = await dmService.getDmThreads(req.workspaceId!, req.user.id);
  res.json(threads);
}

export async function createThread(req: Request, res: Response) {
  try {
    const { other_user_id } = req.body;
    if (!other_user_id) return res.status(400).json({ error: 'other_user_id required' });

    const isMember = await dmService.isWorkspaceMember(req.workspaceId!, other_user_id);
    if (!isMember) return res.status(403).json({ error: 'That user is not a member of this workspace' });

    const existing = await dmService.findExistingThread(req.workspaceId!, req.user.id, other_user_id);
    if (existing) {
      const participants = await dmService.getThreadParticipants(existing.id);
      return res.json({ id: existing.id, workspace_id: req.workspaceId, participants });
    }

    const id = await dmService.createThread(req.workspaceId!, req.user.id, other_user_id);
    const participants = await dmService.getThreadParticipants(id);
    res.status(201).json({ id, workspace_id: req.workspaceId, participants });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getMessages(req: Request, res: Response) {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before ? String(req.query.before) : undefined;
  const result = await dmService.getMessages(String(req.params.threadId), limit, before);
  res.json(result);
}

export async function sendMessage(req: Request, res: Response) {
  try {
    const { content, linked_task_id, parent_message_id, importance } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    if (typeof content !== 'string' || content.length > 5000) {
      return res.status(400).json({ error: 'Message content must be 5000 characters or fewer' });
    }

    if (parent_message_id) {
      const depth = await getMessageNestDepth(parent_message_id, String(req.params.threadId));
      if (depth >= 2) return res.status(400).json({ error: 'Cannot nest more than 2 levels deep' });
    }

    const id = uuidv4();
    await dmService.createMessage({ id, dm_thread_id: String(req.params.threadId), sender_id: req.user.id, content, linked_task_id: linked_task_id ?? null, parent_message_id: parent_message_id ?? null, importance: importance ?? 'normal' } as any);

    const sender = await dmService.getUserById(req.user.id);
    const message = {
      id, dm_thread_id: String(req.params.threadId), sender_id: req.user.id, content,
      linked_task_id: linked_task_id ?? null, created_at: new Date().toISOString(), sender,
      parent_message_id: parent_message_id ?? null, reply_count: 0,
      reactions: [], shared_message_id: null, shared_message: null,
      importance: importance ?? 'normal',
    };

    const participantIds = await dmService.getDmParticipantIds(String(req.params.threadId));

    if (io) {
      if (parent_message_id) {
        const parentParentId = await dmService.getParentMessageId(parent_message_id);
        const rootId = parentParentId ?? parent_message_id;
        const threadParticipantIds = await dmService.getThreadParticipantIds(rootId);
        const notified = new Set<string>();
        threadParticipantIds.forEach(sid => { io!.to(`user:${sid}`).emit('new_dm', message); notified.add(sid); });
        if (!notified.has(req.user.id)) io.to(`user:${req.user.id}`).emit('new_dm', message);
      } else {
        io.to(`dm:${String(req.params.threadId)}`).emit('new_dm', message);
      }
    }

    if (!parent_message_id) {
      for (const uid of participantIds) {
        if (uid !== req.user.id) {
          const notifId = uuidv4();
          await notifService.createNotification({
            id: notifId, user_id: uid, type: 'dm', reference_id: id,
            reference_type: 'message', message: `${sender?.name ?? 'A user'}: "${content.slice(0, 80)}"`,
            workspace_id: req.workspaceId, is_read: 0,
          });
          if (io) io.to(`user:${uid}`).emit('notification', { id: notifId, type: 'dm' });
        }
      }
    }

    res.status(201).json(message);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getThreadReplies(req: Request, res: Response) {
  const messages = await dmService.getThreadReplies(String(req.params.threadId), String(req.params.messageId));
  res.json(messages);
}

async function getMessageNestDepth(messageId: string, threadId: string): Promise<number> {
  const parent = await dmService.getParentMessageId(messageId);
  if (!parent) return 0;
  const grandparent = await dmService.getParentMessageId(parent);
  if (grandparent) return 2;
  return 1;
}
