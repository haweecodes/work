import { Router } from 'express';
import * as task from '../controllers/taskController';

const router = Router();
router.get('/resolve/:taskKey',  task.resolveByKey);
router.get('/task/:id',          task.getById);
router.get('/detail/:id',        task.getDetailForNotification);
router.get('/pending/me',        task.listByBoard);   // placeholder — use taskUpdates route
router.post('/',                 task.create);
router.patch('/:id',             task.update);
router.patch('/:id/move',        task.move);
router.delete('/:id',            task.deleteTask);
router.get('/:id/history',       task.getHistory);
router.get('/:boardId',          task.listByBoard);
export default router;
export { setIo } from '../controllers/taskController';
