import { Router } from 'express';
import {
  getFeed,
  getAllPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  getUserPosts,
  uploadPostImages,
  getTrending,
  searchPosts,
} from '../controllers/postController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { multipleImages } from '../middleware/upload';

const router = Router();

router.get('/feed', authenticate, getFeed);
router.get('/trending', getTrending);
router.get('/search', optionalAuth, searchPosts);
router.get('/', optionalAuth, getAllPosts);
router.get('/user/:handle', optionalAuth, getUserPosts);
router.get('/:id', optionalAuth, getPost);

router.post('/images', authenticate, ...multipleImages('posts', 'images', 4), uploadPostImages);
router.post('/', authenticate, createPost);
router.put('/:id', authenticate, updatePost);
router.delete('/:id', authenticate, deletePost);
router.post('/:id/like', authenticate, likePost);
router.delete('/:id/like', authenticate, unlikePost);

export default router;
