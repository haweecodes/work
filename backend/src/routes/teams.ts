import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run, returning } from '../db';

const router = Router();

async function isAdminOrOwner(workspaceId: string, userId: string): Promise<boolean> {
  const [member, workspace] = await Promise.all([
    get<{ role: string }>('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [workspaceId, userId]),
    get<{ owner_id: string }>('SELECT owner_id FROM workspaces WHERE id = ?', [workspaceId]),
  ]);
  return member?.role === 'admin' || workspace?.owner_id === userId;
}

// GET /api/teams — list teams + members for workspace
router.get('/', async (req, res) => {
  try {
    const teams = await all<{ id: string; workspace_id: string; name: string; created_by: string; created_at: string }>(
      'SELECT * FROM teams WHERE workspace_id = ? ORDER BY created_at ASC',
      [req.workspaceId]
    );
    const teamsWithMembers = await Promise.all(teams.map(async (team) => {
      const members = await all<{ id: string; name: string; avatar_url: string | null }>(
        'SELECT u.id, u.name, u.avatar_url FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ?',
        [team.id]
      );
      return { ...team, members };
    }));
    res.json(teamsWithMembers);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/teams — create team (admin/owner only)
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });

    const allowed = await isAdminOrOwner(req.workspaceId!, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'Admin access required' });

    const id = uuidv4();
    const [team] = await returning<{ id: string; workspace_id: string; name: string; created_by: string }>(
      'INSERT INTO teams (id, workspace_id, name, created_by) VALUES (?, ?, ?, ?) RETURNING *',
      [id, req.workspaceId, name.trim(), req.user.id]
    );
    res.status(201).json({ ...team, members: [] });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/teams/:teamId (admin/owner only)
router.delete('/:teamId', async (req, res) => {
  try {
    const allowed = await isAdminOrOwner(req.workspaceId!, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'Admin access required' });

    const team = await get('SELECT id FROM teams WHERE id = ? AND workspace_id = ?', [req.params.teamId, req.workspaceId]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    await run('DELETE FROM team_members WHERE team_id = ?', [req.params.teamId]);
    await run('DELETE FROM teams WHERE id = ?', [req.params.teamId]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/teams/:teamId/members — add member (admin/owner only)
router.post('/:teamId/members', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const allowed = await isAdminOrOwner(req.workspaceId!, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'Admin access required' });

    const team = await get('SELECT id FROM teams WHERE id = ? AND workspace_id = ?', [req.params.teamId, req.workspaceId]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const isMember = await get('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [req.workspaceId, userId]);
    if (!isMember) return res.status(400).json({ error: 'User is not a workspace member' });

    await run('INSERT INTO team_members (team_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [req.params.teamId, userId]);

    const member = await get<{ id: string; name: string; avatar_url: string | null }>(
      'SELECT id, name, avatar_url FROM users WHERE id = ?', [userId]
    );
    res.status(201).json(member);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/teams/:teamId/members/:userId (admin/owner only)
router.delete('/:teamId/members/:userId', async (req, res) => {
  try {
    const allowed = await isAdminOrOwner(req.workspaceId!, req.user.id);
    if (!allowed) return res.status(403).json({ error: 'Admin access required' });

    const team = await get('SELECT id FROM teams WHERE id = ? AND workspace_id = ?', [req.params.teamId, req.workspaceId]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    await run('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [req.params.teamId, req.params.userId]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
