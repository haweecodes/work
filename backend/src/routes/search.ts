import { Router } from 'express';
import * as search from '../controllers/searchController';

const router = Router();
router.get('/', search.search);
export default router;
