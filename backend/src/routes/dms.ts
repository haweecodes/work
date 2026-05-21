import { Router } from 'express';
import { requireDmParticipant } from '../middleware/workspace';
import * as dm from '../controllers/dmController';

const router = Router();
router.get('/threads/:workspaceId',                    dm.listThreads);
router.post('/threads',                                dm.createThread);
router.get('/:threadId',          requireDmParticipant('threadId'), dm.getMessages);
router.post('/:threadId',         requireDmParticipant('threadId'), dm.sendMessage);
router.get('/:threadId/thread/:messageId', requireDmParticipant('threadId'), dm.getThreadReplies);
export default router;
export { setIo } from '../controllers/dmController';
