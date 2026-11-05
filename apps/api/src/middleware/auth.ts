import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { User } from '../models';
import { IAuthRequest } from '../types';

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
    
    const user = await User.findById(decoded.userId).select('-password');
    
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
    const user = await User.findById(decoded.userId).select('-password');
    
    if (user) {
      req.user = user;
    }
    
    next();
  } catch {
    next();
  }
};
