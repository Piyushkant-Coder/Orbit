import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const env = getEnv();
  const currentLevel = LOG_LEVELS[env.LOG_LEVEL];

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : 'info';

    if (LOG_LEVELS[level] >= currentLevel) {
      console.log(
        `[${level.toUpperCase()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
      );
    }
  });

  next();
}
