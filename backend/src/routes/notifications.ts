import { Router } from 'express';
import * as notif from '../controllers/notificationController';

const router = Router();
router.get('/',              notif.list);
router.patch('/read',        notif.markRead);
router.post('/priority',     notif.sendPriorityAlert);
router.patch('/:id/resolve', notif.resolveAlert);
export default router;
export { setIo } from '../controllers/notificationController';
