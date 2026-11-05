import { Request, Response } from 'express';
import { User } from '../models';
import { generateTokens, verifyRefreshToken } from '../utils/jwt';
import { registerSchema, loginSchema } from '../utils/validation';
import { selfUser } from '../utils/serializers';
import { IApiResponse, IAuthRequest, IUser } from '../types';

const issueTokens = (user: IUser) =>
  generateTokens({ userId: user._id.toString(), handle: user.handle, role: user.role });

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
    data: { user: selfUser(user), tokens: issueTokens(user) },
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
    data: { user: selfUser(user), tokens: issueTokens(user) },
    message: 'Login successful',
  };
  res.status(200).json(response);
};

export const getMe = async (req: IAuthRequest, res: Response): Promise<void> => {
  res.status(200).json({ success: true, data: { user: selfUser(req.user!) } });
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const token = req.body?.refreshToken;
  if (typeof token !== 'string' || !token) {
    res.status(401).json({ success: false, error: 'Refresh token required' });
    return;
  }

  let userId: string;
  try {
    userId = verifyRefreshToken(token).userId;
  } catch {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
    return;
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(401).json({ success: false, error: 'User not found' });
    return;
  }

  res.status(200).json({ success: true, data: { tokens: issueTokens(user) } });
};
