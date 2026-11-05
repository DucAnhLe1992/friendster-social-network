import { Router } from 'express';
import {
  getComments,
  getReplies,
  createComment,
  updateComment,
  deleteComment,
  likeComment,
  unlikeComment,
} from '../controllers/commentController';
import { authenticate, optionalAuth } from '../middleware/auth';

const router = Router({ mergeParams: true });

router.get('/', optionalAuth, getComments);
router.get('/:commentId/replies', optionalAuth, getReplies);

router.post('/', authenticate, createComment);
router.put('/:commentId', authenticate, updateComment);
router.delete('/:commentId', authenticate, deleteComment);
router.post('/:commentId/like', authenticate, likeComment);
router.delete('/:commentId/like', authenticate, unlikeComment);

export default router;
