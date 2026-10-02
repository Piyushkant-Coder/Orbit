import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { getEnv } from '../config/env';
import { RequestWithId } from './requestId';

export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export function errorHandler(
  error: Error | AppError | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const env = getEnv();
  const requestId = (req as RequestWithId).requestId || 'unknown';

  let statusCode = 500;
  let code = 'INTERNAL';
  let message = 'An unexpected error occurred';
  let details: unknown;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
  } else if (error instanceof SyntaxError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid JSON in request body';
  }

  if (env.NODE_ENV !== 'production') {
    console.error(`[${code}] ${message}`, error);
  } else {
    console.error(`[${code}] Request ID: ${requestId}`, error);
  }

  const response: ErrorResponse = {
    error: {
      code,
      message,
      requestId,
    },
  };

  if (details) {
    response.error.details = details;
  }

  res.status(statusCode).json(response);
}
