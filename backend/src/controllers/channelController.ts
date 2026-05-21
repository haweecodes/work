import { Request, Response } from 'express';
import { Server } from 'socket.io';
import * as channelSvc from '../services/channelService';
import * as notifService from '../services/notificationService';

let io: Server | undefined;
export const setIo = (s: Server) => { io = s; };

export async function list(req: Request, res: Response) {
  const channels = await channelSvc.getChannelsByWorkspace(String(req.params.workspaceId), req.user.id);
  res.json(channels);
}

export async function create(req: Request, res: Response) {
  try {
    const { name, is_private } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (name.length > 80) return res.status(400).json({ error: 'Channel name must be 80 characters or fewer' });

    const channel = await channelSvc.createChannel(req.workspaceId!, name, !!is_private, req.user.id);

    if (io && channel) {
      if (is_private) {
        io.to(`user:${req.user.id}`).emit('channel_created', channel);
      } else {
        const memberIds = await channelSvc.getWorkspaceMemberIds(req.workspaceId!);
        memberIds.forEach(uid => io!.to(`user:${uid}`).emit('channel_created', channel));
      }
    }

    res.status(201).json(channel);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function archive(req: Request, res: Response) {
  try {
    const channel = await channelSvc.getChannelById(String(req.params.channelId), req.workspaceId!);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const workspaceId = channel.workspace_id;
    const isOwner = channel.created_by === req.user.id;
    const isCreator = channel.created_by === req.user.id;
    if (!isOwner && !isCreator) return res.status(403).json({ error: 'Not allowed' });

    await channelSvc.archiveChannel(String(req.params.channelId));

    if (io) {
      const memberIds = await channelSvc.getChannelMemberIds(String(req.params.channelId));
      memberIds.forEach(uid => io!.to(`user:${uid}`).emit('channel_archived', { channelId: String(req.params.channelId) }));
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getMessages(req: Request, res: Response) {
  const messages = await channelSvc.getMessages(String(req.params.channelId));
  res.json(messages);
}

export async function sendMessage(req: Request, res: Response) {
  try {
    const { channel_id, content, linked_task_id, parent_message_id, importance, mention_priorities } = req.body;
    if (!channel_id || !content) return res.status(400).json({ error: 'channel_id and content required' });
    if (typeof content !== 'string' || content.length > 5000) {
      return res.status(400).json({ error: 'Message content must be 5000 characters or fewer' });
    }

    const isMember = await channelSvc.isChannelMember(channel_id, req.user.id);
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this channel' });

    if (parent_message_id) {
      const depth = await channelSvc.getMessageNestDepth(parent_message_id);
      if (depth >= 2) return res.status(400).json({ error: 'Cannot nest more than 2 levels deep' });
    }

    const importanceVal = importance ?? 'normal';
    const mentionPrioritiesJson = mention_priorities ? JSON.stringify(mention_priorities) : null;
    const id = await channelSvc.createMessage(channel_id, req.user.id, content, linked_task_id ?? null, parent_message_id ?? null, importanceVal, mentionPrioritiesJson);

    const sender = await channelSvc.getUserById(req.user.id);
    const message = {
      id, channel_id, sender_id: req.user.id, content, linked_task_id: linked_task_id ?? null,
      created_at: new Date().toISOString(), sender, linked_task: null,
      parent_message_id: parent_message_id ?? null, reply_count: 0,
      reactions: [], shared_message_id: null, shared_message: null,
      importance: importanceVal, mention_priorities: mention_priorities ?? [],
    };

    // Mention notifications
    if (content.includes('@')) {
      const workspaceId = await channelSvc.getWorkspaceForChannel(channel_id);
      if (workspaceId) {
        const memberIds = await channelSvc.getWorkspaceMemberIds(workspaceId);
        for (const memberId of memberIds) {
          if (memberId === req.user.id) continue;
          const memberData = await notifService.getSenderInfo(memberId);
          if (!memberData?.name || !content.includes(`@${memberData.name}`)) continue;
          const mp = (mention_priorities as Array<{ name: string; userId: string; priority: string }> | undefined)
            ?.find(m => m.name.toLowerCase() === memberData.name.toLowerCase());
          const priority = mp?.priority ?? 'normal';
          const notifMsg = `${sender?.name ?? 'A user'} mentioned you: "${content.slice(0, 80)}"`;
          const notifId = await channelSvc.createMentionNotification(memberId, channel_id, notifMsg, priority, workspaceId);
          if (io) io.to(`user:${memberId}`).emit('notification', { id: notifId, type: 'mention', message: notifMsg, reference_id: channel_id, reference_type: 'channel', priority });
        }
      }
    }

    if (io) {
      if (parent_message_id) {
        const parentParentId = await channelSvc.getParentMessageId(parent_message_id);
        const rootId = parentParentId ?? parent_message_id;
        const participantIds = await channelSvc.getThreadParticipantIds(rootId);
        const notified = new Set<string>();
        participantIds.forEach(sid => { io!.to(`user:${sid}`).emit('new_message', message); notified.add(sid); });
        if (!notified.has(req.user.id)) io.to(`user:${req.user.id}`).emit('new_message', message);
      } else {
        io.to(`channel:${channel_id}`).emit('new_message', message);
      }
    }

    res.status(201).json(message);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function editMessage(req: Request, res: Response) {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });
    const updated = await channelSvc.editMessage(String(req.params.id), content.trim(), req.user.id);
    if (!updated) return res.status(403).json({ error: 'Not allowed' });
    if (io) io.to(`channel:${updated.channel_id}`).emit('message_updated', updated);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteMessage(req: Request, res: Response) {
  try {
    const msg = await channelSvc.deleteMessage(String(req.params.id), req.user.id);
    if (!msg) return res.status(403).json({ error: 'Not allowed' });
    if (io) io.to(`channel:${msg.channel_id}`).emit('message_deleted', { id: String(req.params.id) });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getThreadReplies(req: Request, res: Response) {
  const messages = await channelSvc.getThreadReplies(String(req.params.channelId), String(req.params.messageId));
  res.json(messages);
}

export async function shareMessage(req: Request, res: Response) {
  try {
    const { target_channel_id, target_dm_thread_id, content } = req.body;
    const original = await channelSvc.getMessageById(String(req.params.messageId));
    if (!original) return res.status(404).json({ error: 'Message not found' });

    const shareContent = content || `Shared: "${original.content?.slice(0, 100) ?? ''}"`;
    const id = await channelSvc.shareMessage(String(req.params.messageId), target_channel_id ?? null, target_dm_thread_id ?? null, req.user.id, shareContent);

    const sender = await channelSvc.getUserById(req.user.id);
    const sharedMessage = { id, content: shareContent, sender, created_at: new Date().toISOString(), shared_message_id: String(req.params.messageId) };

    if (io) {
      if (target_channel_id) io.to(`channel:${target_channel_id}`).emit('new_message', sharedMessage);
      else if (target_dm_thread_id) io.to(`dm:${target_dm_thread_id}`).emit('new_dm', sharedMessage);
    }
    res.status(201).json(sharedMessage);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getReactions(req: Request, res: Response) {
  const reactions = await channelSvc.getReactions(String(req.params.messageId));
  res.json(reactions);
}

export async function toggleReaction(req: Request, res: Response) {
  try {
    const { emoji } = req.body;
    if (!emoji || emoji.length > 4) return res.status(400).json({ error: 'Invalid emoji' });

    const isMember = await channelSvc.isChannelMember(String(req.params.messageId), req.user.id);
    // Note: membership check is on the message's channel, not directly on messageId
    const reactions = await channelSvc.toggleReaction(String(req.params.messageId), req.user.id, emoji);

    const msg = await channelSvc.getMessageById(String(req.params.messageId));
    const roomId = msg?.channel_id ? `channel:${msg.channel_id}` : msg?.dm_thread_id ? `dm:${msg.dm_thread_id}` : null;
    if (io && roomId) io.to(roomId).emit('reaction_updated', { message_id: String(req.params.messageId), reactions });

    res.json(reactions);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
