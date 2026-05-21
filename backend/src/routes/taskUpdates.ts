import { Router } from 'express';
import * as tu from '../controllers/taskUpdateController';

const router = Router();
router.post('/request',                tu.requestUpdate);
router.post('/:requestId/respond',     tu.respond);
router.get('/pending/me',              tu.getPending);
router.get('/notification/:taskId',    tu.getNotificationTask);
router.get('/:boardId',                tu.getHistory);
export default router;
export { setIo } from '../controllers/taskUpdateController';
