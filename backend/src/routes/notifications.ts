import express, { Request, Response } from 'express';
import { all, run } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.get('/:userId', authMiddleware, async (req: Request, res: Response) => {
  const notifications = await all(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.params.userId]
  );
  res.json(notifications);
});

router.patch('/read', authMiddleware, async (req: Request, res: Response) => {
  const { ids } = req.body;

  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  if (ids && Array.isArray(ids) && ids.length > 0) {
    for (const id of ids) {
      await run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, req.user?.id]);
    }
  } else {
    await run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  }
  res.json({ success: true });
});

export default router;
