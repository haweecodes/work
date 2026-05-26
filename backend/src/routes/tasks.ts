import { Router } from 'express';
import * as task from '../controllers/taskController';

const router = Router();
router.get('/',                               task.listMine);       // GET /api/tasks?scope=mine
router.get('/resolve/:taskKey',               task.resolveByKey);
router.get('/task/:id',                       task.getById);
router.get('/detail/:id',                     task.getDetailForNotification);
router.post('/',                              task.create);
router.patch('/:id',                          task.update);
router.patch('/:id/move',                     task.move);
router.delete('/:id',                         task.deleteTask);
router.get('/:id/history',                    task.getHistory);
router.get('/:id/comments',                   task.listComments);
router.post('/:id/comments',                  task.addComment);
router.patch('/:id/comments/:commentId',      task.editComment);
router.delete('/:id/comments/:commentId',     task.deleteComment);
router.get('/:boardId',                       task.listByBoard);
export default router;
export { setIo } from '../controllers/taskController';
