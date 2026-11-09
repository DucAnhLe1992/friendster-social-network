import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { IApiResponse } from '../types';

export interface CustomError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

const REQUEST_ID = /^[\w-]{8,64}$/;

/** Tags every request with an ID (reusing a well-formed upstream X-Request-Id) and logs it on completion. */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

const GENERIC_CLIENT_ERRORS: Record<number, string> = {
  400: 'Invalid request',
  401: 'Authentication required',
  403: 'You do not have permission to do that',
  404: 'Not found',
  413: 'Request is too large',
  429: 'Too many requests, please try again later',
};

export const errorHandler = (err: CustomError, req: Request, res: Response, _next: NextFunction): void => {
  let statusCode = err.statusCode || err.status || 500;
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
  } else if (err instanceof HttpError) {
    message = err.message;
  } else if (statusCode < 500) {
    // Framework errors (malformed JSON, oversized bodies) carry internal wording; never echo it.
    message = GENERIC_CLIENT_ERRORS[statusCode] ?? 'Invalid request';
  }

  if (statusCode >= 500) {
    req.log.error({ err }, 'unhandled error');
    if (env.NODE_ENV !== 'production') message = err.message || message;
  }

  const response: IApiResponse = { success: false, error: message, requestId: String(req.id) };
  res.status(statusCode).json(response);
};

export const notFound = (_req: Request, res: Response): void => {
  const response: IApiResponse = { success: false, error: 'Route not found' };
  res.status(404).json(response);
};

const hasPgCode = (error: unknown, code: string): boolean => {
  const e = error as { code?: string; cause?: unknown } | null;
  return e?.code === code || (e?.cause !== undefined && hasPgCode(e.cause, code));
};

// drizzle wraps driver errors, so the PostgreSQL code may sit on `cause`.
export const isDuplicateKey = (error: unknown): boolean => hasPgCode(error, '23505');
export const isForeignKeyViolation = (error: unknown): boolean => hasPgCode(error, '23503');
