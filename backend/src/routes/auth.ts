import { Router } from 'express';
import * as auth from '../controllers/authController';

const router = Router();
router.post('/register', auth.register);
router.post('/login',    auth.login);
export default router;
