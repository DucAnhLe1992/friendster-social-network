import { z } from 'zod';

// Auth validations
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Handle must be at least 3 characters')
    .max(30, 'Handle must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Handle can only contain letters, numbers, and underscores'),
  displayName: z.string().trim().min(1, 'Display name is required').max(50, 'Display name must be at most 50 characters'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID');

// Only images uploaded through this API are accepted
const uploadedImage = z.string().regex(/^\/uploads\/posts\/[\w.-]+$/, 'Invalid image');

// Post validations
export const createPostSchema = z
  .object({
    content: z.string().trim().max(280, 'Post must be at most 280 characters').default(''),
    images: z.array(uploadedImage).max(4, 'Up to 4 images per post').default([]),
  })
  .refine((data) => data.content.length > 0 || data.images.length > 0, {
    message: 'Write something or add an image',
  });

export const updatePostSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(280, 'Post must be at most 280 characters'),
});

// Comment validations
export const createCommentSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(280, 'Comment must be at most 280 characters'),
  parentComment: objectId.optional(),
});

export const updateCommentSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(280, 'Comment must be at most 280 characters'),
});

// User validations
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'Display name is required').max(50, 'Display name must be at most 50 characters').optional(),
  bio: z.string().max(160, 'Bio must be at most 160 characters').optional(),
  location: z.string().max(30, 'Location must be at most 30 characters').optional(),
  website: z
    .string()
    .trim()
    .max(100, 'Website must be at most 100 characters')
    .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Website must start with http:// or https://')
    .optional(),
});

export const profileTabSchema = z.enum(['posts', 'media', 'likes']).default('posts');

// Pagination validation
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Message validations
export const startConversationSchema = z.object({
  handle: z.string().trim().toLowerCase().min(1, 'Choose someone to message'),
});

export const createMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message is required').max(1000, 'Message must be at most 1000 characters'),
});

export const messagesQuerySchema = z.object({
  before: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
