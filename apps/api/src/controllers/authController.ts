import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import { db } from '../database/db';
import { usersTable } from '../database/schema';
import { endSession, rotateSession, startSession } from '../services/sessions';
import { registerSchema, loginSchema } from '../utils/validation';
import { selfUserColumns } from '../utils/serializers';
import { isDuplicateKey } from '../middleware/errorHandler';
import { IApiResponse, IAuthRequest } from '../types';

const SALT_ROUNDS = 12;

const loadSelf = async (id: string) => {
  const [user] = await db.select(selfUserColumns()).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return user;
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const data = registerSchema.parse(req.body);

  const conflict = (taken: { email: string } | undefined) => {
    res.status(409).json({
      success: false,
      error: !taken || taken.email === data.email ? 'Email already registered' : 'Handle already taken',
    });
  };
  const findTaken = async () => {
    const [taken] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(or(eq(usersTable.email, data.email), eq(usersTable.handle, data.handle)))
      .limit(1);
    return taken;
  };

  const existing = await findTaken();
  if (existing) return conflict(existing);

  let created;
  try {
    [created] = await db
      .insert(usersTable)
      .values({ ...data, password: await bcrypt.hash(data.password, SALT_ROUNDS) })
      .returning({ id: usersTable.id, handle: usersTable.handle, role: usersTable.role });
  } catch (error) {
    if (isDuplicateKey(error)) return conflict(await findTaken());
    throw error;
  }

  const response: IApiResponse = {
    success: true,
    data: { user: await loadSelf(created.id), tokens: await startSession(created) },
    message: 'Registration successful',
  };
  res.status(201).json(response);
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const data = loginSchema.parse(req.body);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, data.email)).limit(1);
  if (!user || !(await bcrypt.compare(data.password, user.password))) {
    res.status(401).json({ success: false, error: 'Invalid email or password' });
    return;
  }

  const response: IApiResponse = {
    success: true,
    data: { user: await loadSelf(user.id), tokens: await startSession(user) },
    message: 'Login successful',
  };
  res.status(200).json(response);
};

export const getMe = async (req: IAuthRequest, res: Response): Promise<void> => {
  res.status(200).json({ success: true, data: { user: await loadSelf(req.user!.id) } });
};

const readRefreshToken = (req: Request): string | null => {
  const token = req.body?.refreshToken;
  return typeof token === 'string' && token ? token : null;
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const token = readRefreshToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Refresh token required' });
    return;
  }

  const session = await rotateSession(token);
  if (!session) {
    res.status(401).json({ success: false, error: 'Session expired. Please sign in again.' });
    return;
  }

  res.status(200).json({ success: true, data: { tokens: session.tokens } });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const token = readRefreshToken(req);
  if (token) await endSession(token);
  res.status(200).json({ success: true });
};
