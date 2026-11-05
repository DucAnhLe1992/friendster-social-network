import { Router } from 'express';
import {
  getUserByHandle,
  updateProfile,
  uploadAvatar,
  uploadCover,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  searchUsers,
  getSuggestions,
  getUserReplies,
} from '../controllers/userController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { singleImage } from '../middleware/upload';

const router = Router();

router.get('/search', optionalAuth, searchUsers);
router.get('/suggestions', authenticate, getSuggestions);

router.put('/profile', authenticate, updateProfile);
router.post('/avatar', authenticate, ...singleImage('avatars', 'avatar'), uploadAvatar);
router.post('/cover', authenticate, ...singleImage('covers', 'cover'), uploadCover);

router.get('/:handle', optionalAuth, getUserByHandle);
router.get('/:handle/followers', optionalAuth, getFollowers);
router.get('/:handle/following', optionalAuth, getFollowing);
router.get('/:handle/replies', getUserReplies);
router.post('/:handle/follow', authenticate, followUser);
router.delete('/:handle/follow', authenticate, unfollowUser);

export default router;
