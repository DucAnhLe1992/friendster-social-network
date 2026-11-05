import request from 'supertest';
import { createApp } from '../src/app';

export const { app } = createApp();

export interface TestUser {
  id: string;
  handle: string;
  accessToken: string;
  refreshToken: string;
}

export const registerUser = async (handle: string): Promise<TestUser> => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: `${handle}@example.com`, password: 'Password123!', handle, displayName: handle });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    id: res.body.data.user._id,
    handle,
    accessToken: res.body.data.tokens.accessToken,
    refreshToken: res.body.data.tokens.refreshToken,
  };
};

export const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });

// Smallest valid PNG: 1x1 transparent pixel.
export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
