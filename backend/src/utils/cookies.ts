import { Request, Response } from 'express';
import { getEnv } from '../config/env';

const COOKIE_NAME = 'rt';

export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const value = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return value ? decodeURIComponent(value.slice(COOKIE_NAME.length + 1)) : undefined;
}

export function setRefreshCookie(res: Response, token: string): void {
  const env = getEnv();
  const secure = env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/api/auth' });
}
