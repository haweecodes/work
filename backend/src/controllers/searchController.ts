import { Request, Response } from 'express';
import * as searchService from '../services/searchService';

export async function search(req: Request, res: Response) {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q || q.length < 2) return res.json({ messages: [], tasks: [] });

    const result = await searchService.searchMessagesAndTasks(q, req.user.id, req.workspaceId!);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
