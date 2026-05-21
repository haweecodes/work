import { Request, Response } from 'express';
import * as boardService from '../services/boardService';

export async function list(req: Request, res: Response) {
  const boards = await boardService.getBoardsByWorkspace(String(req.params.workspaceId));
  res.json(boards);
}

export async function create(req: Request, res: Response) {
  try {
    const { name, columns } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    let baseKey = name.split(/\s+/).map((w: string) => w[0]?.toUpperCase()).join('').substring(0, 5).replace(/[^A-Z]/g, '');
    if (!baseKey) baseKey = 'BRD';

    let projectKey = baseKey;
    let counter = 1;
    while (await boardService.projectKeyExists(req.workspaceId!, projectKey)) {
      projectKey = `${baseKey}${counter++}`;
    }

    const colTitles: string[] = Array.isArray(columns) && columns.length > 0
      ? columns
      : ['To Do', 'In Progress', 'In Review', 'Done'];

    const board = await boardService.createBoard(req.workspaceId!, name, projectKey, req.user.id, colTitles);
    res.status(201).json(board);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function rename(req: Request, res: Response) {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });

    const board = await boardService.getBoardById(String(req.params.id), req.workspaceId!);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const updated = await boardService.updateBoardName(String(req.params.id), name.trim());
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getColumns(req: Request, res: Response) {
  const board = await boardService.getBoardById(String(req.params.boardId), req.workspaceId!);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const columns = await boardService.getColumnsWithTasks(String(req.params.boardId));
  res.json(columns);
}

export async function addColumn(req: Request, res: Response) {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const board = await boardService.getBoardById(String(req.params.boardId), req.workspaceId!);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const col = await boardService.addColumn(String(req.params.boardId), title);
    res.status(201).json(col);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
