import { Request, Response, NextFunction } from 'express';
import { get } from '../db';

/**
 * Guard: the authenticated user must be a member of the channel
 * identified by `req.params[paramName]` (default: 'channelId').
 */
export function requireChannelMember(paramName = 'channelId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const channelId = req.params[paramName];
    if (!channelId || !req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const member = await get(
      'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
      [channelId, req.user.id]
    );
    if (!member) {
      res.status(403).json({ error: 'You are not a member of this channel' });
      return;
    }
    next();
  };
}

/**
 * Guard: the authenticated user must be a participant in the DM thread
 * identified by `req.params[paramName]` (default: 'threadId').
 */
export function requireDmParticipant(paramName = 'threadId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const threadId = req.params[paramName];
    if (!threadId || !req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const participant = await get(
      'SELECT 1 FROM dm_participants WHERE thread_id = ? AND user_id = ?',
      [threadId, req.user.id]
    );
    if (!participant) {
      res.status(403).json({ error: 'You are not a participant in this conversation' });
      return;
    }
    next();
  };
}

/**
 * Guard: the authenticated user must be a member of the workspace
 * identified by `req.params[paramName]` (default: 'workspaceId').
 */
export function requireWorkspaceMember(paramName = 'workspaceId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const workspaceId = req.params[paramName];
    if (!workspaceId || !req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const member = await get(
      'SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, req.user.id]
    );
    if (!member) {
      res.status(403).json({ error: 'You are not a member of this workspace' });
      return;
    }
    next();
  };
}
