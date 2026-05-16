import { Request, Response, NextFunction } from 'express';
import { get } from '../db';

/**
 * Combined auth + workspace guard applied at the router level in index.ts.
 * Resolves workspace ID from (in order):
 *   1. x-workspace-id request header  (preferred — Axios interceptor sends this)
 *   2. req.params.workspaceId
 *   3. req.query.workspace_id
 *
 * On success sets req.workspaceId for downstream handlers.
 */
export function requireWorkspace() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const rawHeader = req.headers['x-workspace-id'];
    const headerVal = Array.isArray(rawHeader) ? rawHeader[0] : (rawHeader as string | undefined);
    const workspaceId: string | undefined =
      headerVal ||
      (req.params.workspaceId as string | undefined) ||
      (req.query.workspace_id as string | undefined);

    if (!workspaceId) {
      res.status(400).json({ error: 'Workspace ID required (x-workspace-id header)' });
      return;
    }

    const workspace = await get<{ id: string; name: string }>(
      'SELECT id, name FROM workspaces WHERE id = ?',
      [workspaceId]
    );
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const member = await get(
      'SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, req.user.id]
    );
    if (!member) {
      res.status(403).json({ error: 'Not a member of this workspace' });
      return;
    }

    req.workspaceId = workspaceId;
    next();
  };
}

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
