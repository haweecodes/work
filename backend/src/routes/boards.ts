import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.get('/:workspaceId', authMiddleware, async (req: Request, res: Response) => {
  const boards = await all(
    'SELECT * FROM boards WHERE workspace_id = ? ORDER BY created_at ASC',
    [req.params.workspaceId]
  );
  res.json(boards);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { workspace_id, name } = req.body;
    if (!workspace_id || !name) {
      return res.status(400).json({ error: 'workspace_id and name required' });
    }

    const id = uuidv4();
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

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

    await run('INSERT INTO boards (id, workspace_id, name, project_key) VALUES (?, ?, ?, ?)',
      [id, workspace_id, name, project_key]);

    const defaultCols = ['To Do', 'In Progress', 'In Review', 'Done'];
    for (let i = 0; i < defaultCols.length; i++) {
      await run('INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)',
        [uuidv4(), id, defaultCols[i], i]);
    }

    const board = await get('SELECT * FROM boards WHERE id = ?', [id]);
    res.status(201).json(board);
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:boardId/columns', authMiddleware, async (req: Request, res: Response) => {
  const columns = await all(
    'SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC',
    [req.params.boardId]
  );

  const enriched = await Promise.all(columns.map(async col => {
    const tasks = await all(
      'SELECT * FROM tasks WHERE column_id = ? ORDER BY position ASC',
      [col.id]
    );
    const tasksWithAssignees = await Promise.all(tasks.map(async task => {
      const assignees = await all(
        `SELECT u.id, u.name, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`,
        [task.id]
      );
      return { ...task, assignees };
    }));
    return { ...col, tasks: tasksWithAssignees };
  }));

  res.json(enriched);
});

router.post('/:boardId/columns', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
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
