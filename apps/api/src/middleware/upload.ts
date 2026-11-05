import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import sharp from 'sharp';
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

// Files are rewritten in place, so never serve a decoded copy from libvips' cache.
sharp.cache(false);

const MAX_INPUT_PIXELS = 50_000_000;
const MAX_DIMENSION = 4096;

// Fully decodes the image (rejecting truncated or malformed files), bounds its size, strips metadata such as GPS
// location, and writes a freshly encoded copy in the same format.
const reencode = async (file: Express.Multer.File): Promise<void> => {
  const animated = file.mimetype === 'image/gif' || file.mimetype === 'image/webp';
  let image = sharp(file.path, { animated, limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
  if (file.mimetype === 'image/jpeg') image = image.rotate();
  image = image.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true });

  const encoders: Record<string, (img: sharp.Sharp) => sharp.Sharp> = {
    'image/jpeg': (img) => img.jpeg({ quality: 88, mozjpeg: true }),
    'image/png': (img) => img.png(),
    'image/webp': (img) => img.webp({ quality: 88 }),
    'image/gif': (img) => img.gif(),
  };
  const output = await encoders[file.mimetype](image).toBuffer();
  await fs.promises.writeFile(file.path, output);
  file.size = output.length;
};

const isValidImage = async (file: Express.Multer.File): Promise<boolean> => {
  try {
    if (!matchesSignature(file.mimetype, await readHead(file.path))) return false;
    await reencode(file);
    return true;
  } catch {
    return false;
  }
};

// The client-supplied MIME type is only a hint; every file must decode as the claimed image format.
const verifyImages = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const files = collectFiles(req);
  const checks = await Promise.all(files.map(isValidImage));
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
