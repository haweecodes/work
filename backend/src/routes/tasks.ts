import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { all, get, run, returning } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
let io: Server | undefined;

export const setIo = (socketIo: Server) => { io = socketIo; };

async function sendAssignmentNotification(
  userId: string, _actorId: string, actorName: string,
  taskId: string, taskTitle: string, _boardId: string,
  type: 'task_assigned' | 'task_unassigned'
) {
  const notifId = uuidv4();
  const msg = type === 'task_assigned'
    ? `${actorName} assigned you to "${taskTitle}"`
    : `${actorName} removed you from "${taskTitle}"`;

  await run(
    'INSERT INTO notifications (id, user_id, type, reference_id, reference_type, message) VALUES (?, ?, ?, ?, ?, ?)',
    [notifId, userId, type, taskId, 'task', msg]
  );
  if (io) io.to(`user:${userId}`).emit('notification', { id: notifId, type, message: msg, reference_id: taskId, reference_type: 'task' });
  // System messages to DMs / channels removed — notification-only approach
}

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { board_id, column_id, title, description, priority, due_date, assignee_ids, linked_message_id, parent_task_id } = req.body;
    if (!board_id || !column_id || !title) {
      return res.status(400).json({ error: 'board_id, column_id, title required' });
    }

    const board = await get(
      'SELECT id, project_key FROM boards WHERE id = ? AND workspace_id = ?',
      [board_id, req.workspaceId]
    );
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const [{ task_sequence }] = await returning<{ task_sequence: number }>(
      'UPDATE boards SET task_sequence = task_sequence + 1 WHERE id = ? RETURNING task_sequence',
      [board_id]
    );
    const task_number = Number(task_sequence);
    const task_key = `${board.project_key}-${task_number}`;

    const existing = await all('SELECT id FROM tasks WHERE column_id = ?', [column_id]);
    const id = uuidv4();
    await run(
      'INSERT INTO tasks (id, board_id, column_id, title, description, priority, due_date, created_by, linked_message_id, parent_task_id, position, task_number, task_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, board_id, column_id, title, description || '', priority || 'medium', due_date || null, req.user.id, linked_message_id || null, parent_task_id || null, existing.length, task_number, task_key]
    );

    if (linked_message_id) {
      await run('UPDATE messages SET linked_task_id = ? WHERE id = ?', [id, linked_message_id]);
    }

    if (assignee_ids && Array.isArray(assignee_ids)) {
      const actorName = (await get<{ name: string }>('SELECT name FROM users WHERE id = ?', [req.user?.id]))?.name || 'A user';
      for (const uid of assignee_ids) {
        await run('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [id, uid]);
        if (uid !== req.user?.id) {
          await sendAssignmentNotification(uid, req.user!.id, actorName, id, title, board_id, 'task_assigned');
        }
      }
    }

    const task = await get(
      'SELECT t.*, c.title as column_title, m.channel_id as linked_channel_id, m.parent_message_id as linked_parent_message_id, m.dm_thread_id as linked_dm_thread_id FROM tasks t LEFT JOIN columns c ON t.column_id = c.id LEFT JOIN messages m ON t.linked_message_id = m.id WHERE t.id = ?',
      [id]
    );
    const assignees = await all(
      `SELECT u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`,
      [id]
    );
    const result = { ...task, assignees };
    if (io) io.to(`board:${board_id}`).emit('task_updated', { type: 'created', task: result });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/detail/:id', authMiddleware, async (req: Request, res: Response) => {
  const task = await get<{ id: string; board_id: string; task_key: string; title: string }>(
    'SELECT t.id, t.board_id, t.task_key, t.title FROM tasks t JOIN boards b ON t.board_id = b.id WHERE t.id = ? AND b.workspace_id = ?',
    [req.params.id, req.workspaceId]
  );
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, description, priority, due_date, assignee_ids, column_id, parent_task_id } = req.body;
    const task = await get(
      'SELECT t.* FROM tasks t JOIN boards b ON t.board_id = b.id WHERE t.id = ? AND b.workspace_id = ?',
      [req.params.id, req.workspaceId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });

    let newPosition = task.position;
    if (column_id && column_id !== task.column_id) {
      const existing = await all('SELECT id FROM tasks WHERE column_id = ?', [column_id]);
      newPosition = existing.length;
    }

    // Convert empty strings to null so PostgreSQL date/UUID columns don't reject them.
    const resolvedDueDate = due_date !== undefined ? (due_date || null) : task.due_date;
    const resolvedParentId = parent_task_id !== undefined
      ? (parent_task_id === req.params.id ? null : (parent_task_id || null))
      : task.parent_task_id;

    await run(
      'UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, column_id = ?, parent_task_id = ?, position = ? WHERE id = ?',
      [title ?? task.title, description ?? task.description, priority ?? task.priority, resolvedDueDate, column_id ?? task.column_id, resolvedParentId, newPosition, req.params.id]
    );

    if (assignee_ids && Array.isArray(assignee_ids)) {
      const ids = assignee_ids as string[];
      const actorName = (await get<{ name: string }>('SELECT name FROM users WHERE id = ?', [req.user?.id]))?.name || 'A user';
      const currentAssignees = await all<{ user_id: string }>('SELECT user_id FROM task_assignees WHERE task_id = ?', [req.params.id]);
      const currentIds = new Set<string>(currentAssignees.map(a => a.user_id));
      const newIds = new Set<string>(ids);

      for (const uid of newIds) {
        if (!currentIds.has(uid)) {
          await run('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [req.params.id, uid]);
          if (uid !== req.user?.id) {
            await sendAssignmentNotification(String(uid), req.user!.id, actorName, String(req.params.id), String(task.title), task.board_id, 'task_assigned');
          }
        }
      }
      for (const uid of currentIds) {
        if (!newIds.has(uid)) {
          await run('DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?', [req.params.id, uid]);
          if (uid !== req.user?.id) {
            await sendAssignmentNotification(String(uid), req.user!.id, actorName, String(req.params.id), String(task.title), task.board_id, 'task_unassigned');
          }
        }
      }
    }

    const updated = await get(
      'SELECT t.*, c.title as column_title, m.channel_id as linked_channel_id, m.parent_message_id as linked_parent_message_id, m.dm_thread_id as linked_dm_thread_id FROM tasks t LEFT JOIN columns c ON t.column_id = c.id LEFT JOIN messages m ON t.linked_message_id = m.id WHERE t.id = ?',
      [req.params.id]
    );
    const assignees = await all(
      `SELECT u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`,
      [req.params.id]
    );
    const result = { ...updated, assignees };
    if (io) io.to(`board:${updated.board_id}`).emit('task_updated', { type: 'updated', task: result });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/move', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { column_id, position } = req.body;
    const task = await get(
      'SELECT t.* FROM tasks t JOIN boards b ON t.board_id = b.id WHERE t.id = ? AND b.workspace_id = ?',
      [req.params.id, req.workspaceId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });

    await run('UPDATE tasks SET column_id = ?, position = ? WHERE id = ?',
      [column_id ?? task.column_id, position ?? task.position, req.params.id]);

    const updated = await get(
      'SELECT t.*, c.title as column_title, m.channel_id as linked_channel_id, m.parent_message_id as linked_parent_message_id, m.dm_thread_id as linked_dm_thread_id FROM tasks t LEFT JOIN columns c ON t.column_id = c.id LEFT JOIN messages m ON t.linked_message_id = m.id WHERE t.id = ?',
      [req.params.id]
    );
    if (io) io.to(`board:${updated.board_id}`).emit('task_updated', { type: 'moved', task: updated });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/resolve/:taskKey', authMiddleware, async (req: Request, res: Response) => {
  try {
    const taskKey = String(req.params.taskKey).toUpperCase();
    const task = await get(
      `SELECT t.id as task_id, t.board_id, b.workspace_id
       FROM tasks t JOIN boards b ON t.board_id = b.id
       WHERE UPPER(t.task_key) = ? AND b.workspace_id = ?`,
      [taskKey, req.workspaceId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/task/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const task = await get(
      `SELECT t.*, c.title as column_title,
        m.channel_id as linked_channel_id,
        m.parent_message_id as linked_parent_message_id,
        m.dm_thread_id as linked_dm_thread_id
       FROM tasks t
       JOIN boards b ON t.board_id = b.id
       LEFT JOIN columns c ON t.column_id = c.id
       LEFT JOIN messages m ON t.linked_message_id = m.id
       WHERE t.id = ? AND b.workspace_id = ?`,
      [req.params.id, req.workspaceId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const assignees = await all(
      `SELECT u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`,
      [req.params.id]
    );
    res.json({ ...task, assignees });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const task = await get(
      'SELECT t.* FROM tasks t JOIN boards b ON t.board_id = b.id WHERE t.id = ? AND b.workspace_id = ?',
      [req.params.id, req.workspaceId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });

    await run('DELETE FROM task_assignees WHERE task_id = ?', [req.params.id]);
    await run('UPDATE messages SET linked_task_id = NULL WHERE linked_task_id = ?', [req.params.id]);
    await run('DELETE FROM tasks WHERE id = ?', [req.params.id]);

    if (io) io.to(`board:${task.board_id}`).emit('task_updated', { type: 'deleted', task_id: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:boardId', authMiddleware, async (req: Request, res: Response) => {
  const board = await get('SELECT 1 FROM boards WHERE id = ? AND workspace_id = ?', [req.params.boardId, req.workspaceId]);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const tasks = await all(
    'SELECT t.*, c.title as column_title, m.channel_id as linked_channel_id, m.parent_message_id as linked_parent_message_id, m.dm_thread_id as linked_dm_thread_id FROM tasks t LEFT JOIN columns c ON t.column_id = c.id LEFT JOIN messages m ON t.linked_message_id = m.id WHERE t.board_id = ? ORDER BY t.position ASC',
    [req.params.boardId]
  );
  const enriched = await Promise.all(tasks.map(async (t: any) => ({
    ...t,
    assignees: await all(
      `SELECT u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`,
      [t.id]
    )
  })));
  res.json(enriched);
});

export default router;
export { router as taskRouter };
