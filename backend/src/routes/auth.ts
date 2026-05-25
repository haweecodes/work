import { Router } from 'express';
import * as auth from '../controllers/authController';

const router = Router();
router.post('/register',      auth.register);
router.post('/login',         auth.login);
router.patch('/profile',      ...auth.updateProfile);
router.patch('/status',       ...auth.setStatus);
export default router;
export { setIo } from '../controllers/authController';
