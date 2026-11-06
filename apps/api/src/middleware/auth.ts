import { Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { eq, getTableColumns } from 'drizzle-orm';
import { db } from '../database/db';
import { usersTable } from '../database/schema';
import { AuthUser, IAuthRequest } from '../types';

const userColumns = Object.fromEntries(
  Object.entries(getTableColumns(usersTable)).filter(([key]) => key !== 'password')
) as Omit<ReturnType<typeof getTableColumns<typeof usersTable>>, 'password'>;

const loadUser = async (id: string): Promise<AuthUser | null> => {
  const [user] = await db.select(userColumns).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return user ?? null;
};

export const authenticate = async (
  req: IAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Access token required' });
      return;
    }
    
    const token = authHeader.substring(7);
    
    if (!token) {
      res.status(401).json({ success: false, error: 'Access token required' });
      return;
    }
    
    const decoded = verifyAccessToken(token);
    
    const user = await loadUser(decoded.userId);
    
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }
    
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: 'Token expired' });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

export const optionalAuth = async (
  req: IAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }
    
    const token = authHeader.substring(7);
    
    if (!token) {
      next();
      return;
    }
    
    const decoded = verifyAccessToken(token);
    const user = await loadUser(decoded.userId);
    
    if (user) {
      req.user = user;
    }
    
    next();
  } catch {
    next();
  }
};
