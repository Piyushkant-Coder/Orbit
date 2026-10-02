import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';
import { AppError } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(
        'UNAUTHENTICATED',
        'Missing or invalid authorization header',
        401
      );
    }

    const token = authHeader.substring(7);
    const env = getEnv();

    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET, {
      algorithms: ['HS256'],
      issuer: 'workspace-api',
      audience: 'workspace-client',
    }) as { sub: string };

    req.userId = decoded.sub;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('TOKEN_EXPIRED', 'Access token has expired', 401);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('UNAUTHENTICATED', 'Invalid access token', 401);
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('UNAUTHENTICATED', 'Authentication failed', 401);
  }
}
