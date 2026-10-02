import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export interface RequestWithId extends Request {
  requestId: string;
}

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const id = randomUUID();
  (req as RequestWithId).requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}
