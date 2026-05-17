import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { all, get, run } from '../db';

const router = express.Router();
let io: Server | undefined;
export const setIo = (socketIo: Server) => { io = socketIo; };

// ── Permission helper ─────────────────────────────────────────────────────────

async function canRequestUpdates(userId: string, workspaceId: string, boardCreatedBy: string): Promise<boolean> {
  if (userId === boardCreatedBy) return true;
  const member = await get<{ role: string }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspaceId, userId]
  );
  return member?.role === 'admin';
}

// ── POST /request ─────────────────────────────────────────────────────────────

router.post('/request', async (req: Request, res: Response) => {
  try {
    const { board_id, scope, task_id, column_id } = req.body;
    if (!board_id || !scope || !['task', 'column', 'board'].includes(scope)) {
      return res.status(400).json({ error: 'board_id and scope (task|column|board) required' });
    }
    if (scope === 'task' && !task_id) return res.status(400).json({ error: 'task_id required for task scope' });
    if (scope === 'column' && !column_id) return res.status(400).json({ error: 'column_id required for column scope' });

    const board = await get<{ id: string; created_by: string }>(
      'SELECT id, created_by FROM boards WHERE id = ? AND workspace_id = ?',
      [board_id, req.workspaceId]
    );
    if (!board) return res.status(404).json({ error: 'Board not found' });

    if (!await canRequestUpdates(req.user.id, req.workspaceId!, board.created_by)) {
      return res.status(403).json({ error: 'Only the board creator or workspace admins can request updates' });
    }

    // Resolve target tasks with their assignees
    let tasks: Array<{ id: string; title: string; task_key: string }> = [];
    if (scope === 'task') {
      const t = await get<{ id: string; title: string; task_key: string }>(
        'SELECT id, title, task_key FROM tasks WHERE id = ? AND board_id = ?', [task_id, board_id]
      );
      if (t) tasks = [t];
    } else if (scope === 'column') {
      tasks = await all('SELECT id, title, task_key FROM tasks WHERE column_id = ? AND board_id = ?', [column_id, board_id]);
    } else {
      tasks = await all('SELECT id, title, task_key FROM tasks WHERE board_id = ?', [board_id]);
    }

    if (tasks.length === 0) return res.status(400).json({ error: 'No tasks found in the specified scope' });

    const requestId = uuidv4();
    await run(
      'INSERT INTO task_update_requests (id, board_id, scope, task_id, column_id, requested_by, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [requestId, board_id, scope, task_id || null, column_id || null, req.user.id, req.workspaceId]
    );

    const requester = await get<{ name: string }>('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const requesterName = requester?.name ?? 'Someone';

    // For each task → each assignee → create a notification
    const notifiedUsers = new Set<string>();
    for (const task of tasks) {
      const assignees = await all<{ user_id: string }>(
        'SELECT user_id FROM task_assignees WHERE task_id = ?', [task.id]
      );
      for (const { user_id } of assignees) {
        if (user_id === req.user.id || notifiedUsers.has(`${task.id}:${user_id}`)) continue;
        notifiedUsers.add(`${task.id}:${user_id}`);

        const notifId = uuidv4();
        const notifMsg = `${requesterName} is asking for an update on "${task.title}"`;
        // reference_id = task_id (for inline response + navigation)
        // extra_id = request_id (needed to submit the response)
        await run(
          'INSERT INTO notifications (id, user_id, type, reference_id, reference_type, message, extra_id, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [notifId, user_id, 'task_update_request', task.id, 'update_request', notifMsg, requestId, req.workspaceId]
        );
        if (io) io.to(`user:${user_id}`).emit('notification', {
          id: notifId, type: 'task_update_request', message: notifMsg,
          reference_id: task.id, reference_type: 'update_request', extra_id: requestId,
        });
      }
    }

    const requestRow = { id: requestId, board_id, scope, task_id: task_id || null, column_id: column_id || null, requested_by: req.user.id, requester_name: requesterName, workspace_id: req.workspaceId, created_at: new Date().toISOString(), responses: [] };
    if (io) io.to(`board:${board_id}`).emit('task_update_requested', requestRow);
    res.status(201).json(requestRow);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /:requestId/respond ──────────────────────────────────────────────────

router.post('/:requestId/respond', async (req: Request, res: Response) => {
  try {
    const { task_id, status, reason } = req.body;
    if (!task_id || !status || !['on_track', 'delayed', 'finished', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'task_id and status required' });
    }

    const request = await get<{ id: string; board_id: string; requested_by: string; scope: string; task_id: string | null; column_id: string | null }>(
      'SELECT * FROM task_update_requests WHERE id = ? AND workspace_id = ?',
      [req.params.requestId, req.workspaceId]
    );
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Verify the current user is an assignee of the target task
    const isAssignee = await get(
      'SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?',
      [task_id, req.user.id]
    );
    if (!isAssignee) return res.status(403).json({ error: 'You are not an assignee of this task' });

    // Upsert response
    const existingResp = await get<{ id: string }>(
      'SELECT id FROM task_update_responses WHERE request_id = ? AND task_id = ? AND user_id = ?',
      [request.id, task_id, req.user.id]
    );
    const responseId = existingResp?.id ?? uuidv4();
    if (existingResp) {
      await run('UPDATE task_update_responses SET status = ?, reason = ?, created_at = NOW() WHERE id = ?',
        [status, reason || null, responseId]);
    } else {
      await run('INSERT INTO task_update_responses (id, request_id, task_id, user_id, status, reason) VALUES (?, ?, ?, ?, ?, ?)',
        [responseId, request.id, task_id, req.user.id, status, reason || null]);
    }

    // Mark the requester's notification read — find it
    await run(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND type = 'task_update_request' AND reference_id = ?",
      [req.user.id, request.id]
    );

    // Notify the requester
    const responder = await get<{ name: string }>('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const task = await get<{ task_key: string; title: string }>('SELECT task_key, title FROM tasks WHERE id = ?', [task_id]);
    const statusLabel = { on_track: 'On Track', delayed: 'Delayed', finished: 'Finished', cancelled: 'Cancelled' }[status as string] ?? status;
    const notifMsg = `${responder?.name}: ${task?.task_key} — ${statusLabel}${reason ? ` (${reason})` : ''}`;
    const notifId = uuidv4();
    await run(
      'INSERT INTO notifications (id, user_id, type, reference_id, reference_type, message, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [notifId, request.requested_by, 'task_update_response', request.id, 'update_request', notifMsg, req.workspaceId]
    );
    if (io) io.to(`user:${request.requested_by}`).emit('notification', {
      id: notifId, type: 'task_update_response', message: notifMsg,
      reference_id: request.id, reference_type: 'update_request',
    });

    const responseRow = {
      id: responseId, request_id: request.id, task_id, task_key: task?.task_key, task_title: task?.title,
      user_id: req.user.id, user_name: responder?.name, status, reason: reason || null,
      created_at: new Date().toISOString(),
    };
    if (io) io.to(`board:${request.board_id}`).emit('task_update_responded', { request_id: request.id, response: responseRow });
    res.json(responseRow);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /:boardId — full update history ───────────────────────────────────────

router.get('/:boardId', async (req: Request, res: Response) => {
  try {
    const board = await get('SELECT 1 FROM boards WHERE id = ? AND workspace_id = ?', [req.params.boardId, req.workspaceId]);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const requests = await all<any>(
      `SELECT r.*, u.name as requester_name
       FROM task_update_requests r
       JOIN users u ON u.id = r.requested_by
       WHERE r.board_id = ? AND r.workspace_id = ?
       ORDER BY r.created_at DESC`,
      [req.params.boardId, req.workspaceId]
    );

    if (requests.length === 0) return res.json([]);

    const requestIds = requests.map((r: any) => r.id);
    const ph = requestIds.map(() => '?').join(', ');
    const responses = await all<any>(
      `SELECT resp.*, t.task_key, t.title as task_title, u.name as user_name
       FROM task_update_responses resp
       JOIN tasks t ON t.id = resp.task_id
       JOIN users u ON u.id = resp.user_id
       WHERE resp.request_id IN (${ph})
       ORDER BY resp.created_at ASC`,
      requestIds
    );

    // Also fetch pending (no response yet) task+assignee pairs per request
    const pendingRows = await all<any>(
      `SELECT r.id as request_id, t.id as task_id, t.task_key, t.title as task_title,
              ta.user_id, u.name as user_name
       FROM task_update_requests r
       JOIN tasks t ON (
         (r.scope = 'task'   AND t.id = r.task_id)   OR
         (r.scope = 'column' AND t.column_id = r.column_id AND t.board_id = r.board_id) OR
         (r.scope = 'board'  AND t.board_id = r.board_id)
       )
       JOIN task_assignees ta ON ta.task_id = t.id
       JOIN users u ON u.id = ta.user_id
       WHERE r.id IN (${ph})`,
      requestIds
    );

    const responsesByRequest: Record<string, any[]> = {};
    for (const r of responses) {
      if (!responsesByRequest[r.request_id]) responsesByRequest[r.request_id] = [];
      responsesByRequest[r.request_id].push(r);
    }

    // Build pending entries (task+user combos that haven't responded)
    const respondedKeys = new Set(responses.map((r: any) => `${r.request_id}:${r.task_id}:${r.user_id}`));
    const pendingByRequest: Record<string, any[]> = {};
    for (const p of pendingRows) {
      const key = `${p.request_id}:${p.task_id}:${p.user_id}`;
      if (!respondedKeys.has(key)) {
        if (!pendingByRequest[p.request_id]) pendingByRequest[p.request_id] = [];
        pendingByRequest[p.request_id].push({ ...p, status: 'pending' });
      }
    }

    const result = requests.map((r: any) => ({
      ...r,
      responses: [
        ...(responsesByRequest[r.id] ?? []),
        ...(pendingByRequest[r.id] ?? []),
      ],
    }));

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /pending — pending requests for current user ──────────────────────────

// Each notification now has reference_id = task_id and extra_id = request_id,
// so this is a direct query with no scope expansion needed.
router.get('/pending/me', async (req: Request, res: Response) => {
  try {
    const pending = await all<any>(
      `SELECT n.id as notification_id, n.extra_id as request_id,
              n.reference_id as task_id, r.board_id,
              u.name as requester_name
       FROM notifications n
       JOIN task_update_requests r ON r.id = n.extra_id
       JOIN users u ON u.id = r.requested_by
       WHERE n.user_id = ? AND n.type = 'task_update_request'
         AND n.workspace_id = ? AND n.is_read = 0`,
      [req.user.id, req.workspaceId]
    );
    res.json(pending);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /notification/:taskId — resolve task_id → board_id + task_key ─────────
// reference_id on task_update_request notifications is now the task_id directly.

router.get('/notification/:taskId', async (req: Request, res: Response) => {
  try {
    const task = await get<{ task_key: string; board_id: string }>(
      'SELECT task_key, board_id FROM tasks t JOIN boards b ON b.id = t.board_id WHERE t.id = ? AND b.workspace_id = ?',
      [req.params.taskId, req.workspaceId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ board_id: task.board_id, task_key: task.task_key });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
