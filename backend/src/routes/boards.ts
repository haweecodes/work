import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run, runTransaction } from '../db';

const ph = (arr: any[]) => arr.map(() => '?').join(', ');
import { authMiddleware } from '../middleware/auth';
import { requireWorkspaceMember } from '../middleware/workspace';

const router = express.Router();

router.get('/:workspaceId', authMiddleware, requireWorkspaceMember('workspaceId'), async (req: Request, res: Response) => {
  const boards = await all(
    'SELECT * FROM boards WHERE workspace_id = ? ORDER BY created_at ASC',
    [req.params.workspaceId]
  );
  res.json(boards);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, columns } = req.body;
    const workspace_id = req.workspaceId!;
    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }

    const id = uuidv4();

    let baseKey = name.split(/\s+/).map((w: string) => w[0]?.toUpperCase()).join('').substring(0, 5).replace(/[^A-Z]/g, '');
    if (!baseKey) baseKey = 'BRD';

    let project_key = baseKey;
    let counter = 1;
    while (true) {
      const existing = await get('SELECT 1 FROM boards WHERE workspace_id = ? AND project_key = ?', [workspace_id, project_key]);
      if (!existing) break;
      project_key = `${baseKey}${counter}`;
      counter++;
    }

    const cols: string[] = (Array.isArray(columns) && columns.length > 0)
      ? columns
      : ['To Do', 'In Progress', 'In Review', 'Done'];

    const colVals = cols.map(() => '(?, ?, ?, ?)').join(', ');
    const colParams = cols.flatMap((title, i) => [uuidv4(), id, title, i]);

    await runTransaction([
      { query: 'INSERT INTO boards (id, workspace_id, name, project_key) VALUES (?, ?, ?, ?)',
        params: [id, workspace_id, name, project_key] },
      { query: `INSERT INTO columns (id, board_id, title, position) VALUES ${colVals}`,
        params: colParams },
    ]);

    const board = await get('SELECT * FROM boards WHERE id = ?', [id]);
    res.status(201).json(board);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const board = await get('SELECT id FROM boards WHERE id = ? AND workspace_id = ?', [req.params.id, req.workspaceId]);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    await run('UPDATE boards SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
    res.json(await get('SELECT * FROM boards WHERE id = ?', [req.params.id]));
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:boardId/columns', authMiddleware, async (req: Request, res: Response) => {
  const board = await get('SELECT id FROM boards WHERE id = ? AND workspace_id = ?', [req.params.boardId, req.workspaceId]);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const columns = await all('SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC', [req.params.boardId]);
  const tasks   = await all('SELECT * FROM tasks WHERE board_id = ? ORDER BY position ASC', [req.params.boardId]);

  const taskIds = tasks.map((t: any) => t.id);
  const allAssignees = taskIds.length > 0
    ? await all<any>(
        `SELECT ta.task_id, u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id IN (${ph(taskIds)})`,
        taskIds
      )
    : [];

  const assigneesByTask: Record<string, any[]> = {};
  for (const a of allAssignees) {
    if (!assigneesByTask[a.task_id]) assigneesByTask[a.task_id] = [];
    assigneesByTask[a.task_id].push({ id: a.id, name: a.name, avatar_url: a.avatar_url });
  }

  const tasksWithAssignees = tasks.map((t: any) => ({ ...t, assignees: assigneesByTask[t.id] ?? [] }));
  const tasksByCol: Record<string, any[]> = {};
  for (const t of tasksWithAssignees) {
    if (!tasksByCol[t.column_id]) tasksByCol[t.column_id] = [];
    tasksByCol[t.column_id].push(t);
  }

  res.json(columns.map((col: any) => ({ ...col, tasks: tasksByCol[col.id] ?? [] })));
});

router.post('/:boardId/columns', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const board = await get('SELECT id FROM boards WHERE id = ? AND workspace_id = ?', [req.params.boardId, req.workspaceId]);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    const existing = await all('SELECT id FROM columns WHERE board_id = ?', [req.params.boardId]);
    const id = uuidv4();
    await run('INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)',
      [id, req.params.boardId, title, existing.length]);
    res.status(201).json(await get('SELECT * FROM columns WHERE id = ?', [id]));
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
