import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireWorkspaceMember } from '../middleware/workspace';
import * as workspace from '../controllers/workspaceController';
import * as settings from '../controllers/workspaceSettingsController';

const router = Router();
router.get('/',              authMiddleware, workspace.list);
router.post('/',             authMiddleware, workspace.create);
router.get('/:id/members',                  authMiddleware, requireWorkspaceMember('id'), workspace.getMembers);
router.patch('/:id/members/:userId/role',   authMiddleware, requireWorkspaceMember('id'), workspace.updateMemberRole);
router.post('/:id/invite',   authMiddleware, requireWorkspaceMember('id'), workspace.invite);
router.get('/:id/settings',  authMiddleware, requireWorkspaceMember('id'), settings.getSettings);
router.put('/:id/settings',  authMiddleware, requireWorkspaceMember('id'), settings.updateSettings);
router.get('/join/:code',    workspace.getByCode);
router.post('/join/:code',   authMiddleware, workspace.joinByCode);
export default router;
export { setIo } from '../controllers/workspaceController';
