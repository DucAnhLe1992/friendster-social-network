import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { NextFunction, Request, Response } from 'express';
import { HttpError } from './errorHandler';
import { IAuthRequest } from '../types';

export const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

type Folder = 'avatars' | 'covers' | 'posts';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const matchesSignature = (mimetype: string, head: Buffer): boolean => {
  switch (mimetype) {
    case 'image/jpeg':
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'image/png':
      return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString('latin1'));
    case 'image/webp':
      return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
    default:
      return false;
  }
};

const readHead = async (filePath: string): Promise<Buffer> => {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    await handle.read(buffer, 0, 12, 0);
    return buffer;
  } finally {
    await handle.close();
  }
};

export const removeUpload = async (publicPath: string | undefined | null): Promise<void> => {
  if (!publicPath?.startsWith('/uploads/')) return;
  const resolved = path.resolve(UPLOADS_ROOT, publicPath.slice('/uploads/'.length));
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return;
  await fs.promises.unlink(resolved).catch(() => undefined);
};

const collectFiles = (req: Request): Express.Multer.File[] => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  return [];
};

// The client-supplied MIME type is only a hint; reject files whose bytes are not the claimed image format.
const verifyImages = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const files = collectFiles(req);
  const checks = await Promise.all(files.map(async (f) => matchesSignature(f.mimetype, await readHead(f.path))));
  if (checks.every(Boolean)) return next();

  await Promise.all(files.map((f) => fs.promises.unlink(f.path).catch(() => undefined)));
  next(new HttpError(400, 'One or more files are not valid images'));
};

const ownerPrefix = (req: Request) => `${(req as IAuthRequest).user!._id.toString()}-`;

const createUploader = (folder: Folder) => {
  const destination = path.join(UPLOADS_ROOT, folder);
  fs.mkdirSync(destination, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination,
      filename: (req, file, cb) => {
        cb(null, `${ownerPrefix(req)}${Date.now()}-${crypto.randomBytes(8).toString('hex')}${EXTENSIONS[file.mimetype]}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 4 },
    fileFilter: (_req, file, cb) => {
      if (EXTENSIONS[file.mimetype]) cb(null, true);
      else cb(new HttpError(400, 'Only JPG, PNG, WEBP or GIF images are allowed'));
    },
  });
};

export const singleImage = (folder: Exclude<Folder, 'posts'>, field: string) => [createUploader(folder).single(field), verifyImages];

export const multipleImages = (folder: Folder, field: string, max: number) => [
  createUploader(folder).array(field, max),
  verifyImages,
];

export const uploadedPath = (folder: Folder, filename: string): string => `/uploads/${folder}/${filename}`;

// A post may only reference images its author uploaded that still exist on disk.
export const isOwnedExistingUpload = async (publicPath: string, folder: Folder, userId: string): Promise<boolean> => {
  const prefix = `/uploads/${folder}/${userId}-`;
  if (!publicPath.startsWith(prefix)) return false;
  const filename = path.basename(publicPath);
  try {
    const stat = await fs.promises.stat(path.join(UPLOADS_ROOT, folder, filename));
    return stat.isFile();
  } catch {
    return false;
  }
};
