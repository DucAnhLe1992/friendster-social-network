import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { env } from '../config/env';
import { IApiResponse } from '../types';

export interface CustomError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: CustomError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let message = 'Something went wrong. Please try again.';

  if (err instanceof ZodError) {
    statusCode = 400;
    message = err.issues[0]?.message || 'Invalid input';
  } else if (err instanceof MulterError) {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Images must be 5MB or smaller' : 'Upload failed';
  } else if (isDuplicateKey(err)) {
    statusCode = 409;
    message = 'That already exists';
  } else if (statusCode < 500) {
    message = err.message;
  }

  if (statusCode >= 500) {
    console.error('Unhandled error:', err);
    if (env.NODE_ENV !== 'production') message = err.message || message;
  }

  const response: IApiResponse = { success: false, error: message };
  res.status(statusCode).json(response);
};

export const notFound = (req: Request, res: Response): void => {
  const response: IApiResponse = {
    success: false,
    error: `Route ${req.originalUrl} not found`,
  };
  res.status(404).json(response);
};

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

// PostgreSQL unique_violation; drizzle wraps driver errors, so the code may sit on `cause`.
export const isDuplicateKey = (error: unknown): boolean => {
  const e = error as { code?: string; cause?: unknown } | null;
  return e?.code === '23505' || (e?.cause !== undefined && isDuplicateKey(e.cause));
};
