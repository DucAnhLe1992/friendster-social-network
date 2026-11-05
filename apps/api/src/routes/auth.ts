import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, refreshToken, logout, getMe } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many attempts. Please wait a few minutes and try again.' },
});

router.post('/register', credentialLimiter, register);
router.post('/login', credentialLimiter, login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);

export default router;
