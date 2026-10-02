import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createAccessToken(userId: string): string {
  const env = getEnv();
  return jwt.sign({}, env.ACCESS_TOKEN_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: 'workspace-api',
    audience: 'workspace-client',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}
