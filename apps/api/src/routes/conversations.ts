import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  listConversations,
  getUnreadTotal,
  startConversation,
  getConversation,
  getMessages,
  sendMessage,
  markConversationRead,
} from '../controllers/messageController';
import { authenticate } from '../middleware/auth';

const router = Router();

const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'You are sending messages too quickly. Please slow down.' },
});

router.use(authenticate);

router.get('/', listConversations);
router.get('/unread-count', getUnreadTotal);
router.post('/', startConversation);
router.get('/:id', getConversation);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendLimiter, sendMessage);
router.post('/:id/read', markConversationRead);

export default router;
