import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { HttpError } from './errorHandler';

export const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const imageUpload = (folder: 'avatars' | 'covers' | 'posts') => {
  const destination = path.join(UPLOADS_ROOT, folder);
  fs.mkdirSync(destination, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination,
      filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${EXTENSIONS[file.mimetype]}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 4 },
    fileFilter: (_req, file, cb) => {
      if (EXTENSIONS[file.mimetype]) cb(null, true);
      else cb(new HttpError(400, 'Only JPG, PNG, WEBP or GIF images are allowed'));
    },
  });
};

export const uploadedPath = (folder: string, filename: string): string => `/uploads/${folder}/${filename}`;
