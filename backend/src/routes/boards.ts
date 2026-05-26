import { Router } from 'express';
import { requireWorkspaceMember } from '../middleware/workspace';
import * as board from '../controllers/boardController';

const router = Router();
router.get('/:workspaceId',           requireWorkspaceMember('workspaceId'), board.list);
router.post('/',                      board.create);
router.patch('/:id',                  board.rename);
router.get('/:boardId/channel',       board.getBoardChannelHandler);
router.post('/:boardId/channel',      board.createBoardChannelHandler);
router.get('/:boardId/columns',       board.getColumns);
router.post('/:boardId/columns',      board.addColumn);
export default router;
export { setIo } from '../controllers/boardController';
