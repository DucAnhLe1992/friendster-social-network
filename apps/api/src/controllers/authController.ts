import { Request, Response } from 'express';
import { User } from '../models';
import { endSession, rotateSession, startSession } from '../services/sessions';
import { registerSchema, loginSchema } from '../utils/validation';
import { selfUser } from '../utils/serializers';
import { IApiResponse, IAuthRequest } from '../types';

export const register = async (req: Request, res: Response): Promise<void> => {
  const data = registerSchema.parse(req.body);

  const existingUser = await User.findOne({ $or: [{ email: data.email }, { handle: data.handle }] });
  if (existingUser) {
    const response: IApiResponse = {
      success: false,
      error: existingUser.email === data.email ? 'Email already registered' : 'Handle already taken',
    };
    res.status(409).json(response);
    return;
  }

  const user = await User.create(data);

  const response: IApiResponse = {
    success: true,
    data: { user: selfUser(user), tokens: await startSession(user) },
    message: 'Registration successful',
  };
  res.status(201).json(response);
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const data = loginSchema.parse(req.body);

  const user = await User.findOne({ email: data.email }).select('+password');
  if (!user || !(await user.comparePassword(data.password))) {
    res.status(401).json({ success: false, error: 'Invalid email or password' });
    return;
  }

  const response: IApiResponse = {
    success: true,
    data: { user: selfUser(user), tokens: await startSession(user) },
    message: 'Login successful',
  };
  res.status(200).json(response);
};

export const getMe = async (req: IAuthRequest, res: Response): Promise<void> => {
  res.status(200).json({ success: true, data: { user: selfUser(req.user!) } });
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
