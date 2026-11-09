import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, refreshToken, logout, getMe } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

const limiter = (max: number, error: string) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error },
  });

const credentialLimiter = limiter(20, 'Too many attempts. Please wait a few minutes and try again.');
// Generous enough for many tabs refreshing every 15 minutes, tight enough to stop token-guessing loops.
const sessionLimiter = limiter(120, 'Too many session requests. Please wait a few minutes and try again.');

router.post('/register', credentialLimiter, register);
router.post('/login', credentialLimiter, login);
router.post('/refresh', sessionLimiter, refreshToken);
router.post('/logout', sessionLimiter, logout);
router.get('/me', authenticate, getMe);

export default router;
