import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireWorkspaceMember } from '../middleware/workspace';
import * as workspace from '../controllers/workspaceController';

const router = Router();
router.get('/',              authMiddleware, workspace.list);
router.post('/',             authMiddleware, workspace.create);
router.get('/:id/members',   authMiddleware, requireWorkspaceMember('id'), workspace.getMembers);
router.post('/:id/invite',   authMiddleware, requireWorkspaceMember('id'), workspace.invite);
router.get('/join/:code',    workspace.getByCode);
router.post('/join/:code',   authMiddleware, workspace.joinByCode);
export default router;
export { setIo } from '../controllers/workspaceController';
