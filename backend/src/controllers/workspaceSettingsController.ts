import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db, workspaces } from '../db';
import {
  getWorkspaceSettings,
  upsertWorkspaceSettings,
  DEFAULT_STATUSES,
  type StatusConfig,
} from '../services/workspaceSettingsService';

function isAdmin(userId: string, workspaceOwnerId: string, role: string | null): boolean {
  return userId === workspaceOwnerId || role === 'admin';
}

export async function getSettings(req: Request, res: Response) {
  try {
    const settings = await getWorkspaceSettings(req.params.id);
    res.json(settings);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function updateSettings(req: Request, res: Response) {
  try {
    const { task_update_statuses } = req.body;

    // Must be admin or owner
    const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, req.params.id) });
    if (!ws) return res.status(404).json({ error: 'Workspace not found' });

    const { workspace_members } = await import('../db');
    const { and } = await import('drizzle-orm');
    const member = await db.query.workspace_members.findFirst({
      where: and(
        eq(workspace_members.workspace_id, req.params.id),
        eq(workspace_members.user_id, req.user.id),
      ),
      columns: { role: true },
    });

    if (!isAdmin(req.user.id, ws.owner_id, member?.role ?? null)) {
      return res.status(403).json({ error: 'Only admins can change workspace settings' });
    }

    if (!Array.isArray(task_update_statuses) || task_update_statuses.length === 0) {
      return res.status(400).json({ error: 'task_update_statuses must be a non-empty array' });
    }
    if (task_update_statuses.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 statuses allowed' });
    }
    for (const s of task_update_statuses) {
      if (!s.value || !s.label || !s.color) {
        return res.status(400).json({ error: 'Each status must have value, label, and color' });
      }
    }

    const statuses: StatusConfig[] = task_update_statuses.map(s => ({
      value: String(s.value).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      label: String(s.label).slice(0, 40),
      color: String(s.color),
      requiresReason: !!s.requiresReason,
    }));

    await upsertWorkspaceSettings(req.params.id, statuses);
    res.json({ task_update_statuses: statuses });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
