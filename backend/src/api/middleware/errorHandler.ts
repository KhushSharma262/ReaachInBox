import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../../lib/logger';

// â”€â”€â”€ Consistent API error response shape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  details?: unknown,
): ApiError {
  return {
    success: false,
    error: { code, message, details },
  };
}

// â”€â”€â”€ Centralized error handler middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Zod validation errors â†’ 400
  if (err instanceof ZodError) {
    res.status(400).json(
      createErrorResponse('VALIDATION_ERROR', 'Request validation failed', {
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      }),
    );
    return;
  }

  // AppError (our custom errors) â†’ use their status code
  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json(createErrorResponse(err.code, err.message));
    return;
  }

  // Unknown errors â†’ 500, don't leak internals
  logger.error({ err }, 'Unhandled error');
  res
    .status(500)
    .json(
      createErrorResponse(
        'INTERNAL_ERROR',
        'An unexpected error occurred. Please try again.',
      ),
    );
}

// â”€â”€â”€ Custom error class â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error factories
export const Errors = {
  notFound: (resource: string) =>
    new AppError(404, 'NOT_FOUND', `${resource} not found`),
  unauthorized: () =>
    new AppError(401, 'UNAUTHORIZED', 'Authentication required'),
  forbidden: () =>
    new AppError(403, 'FORBIDDEN', 'You do not have access to this resource'),
  badRequest: (message: string) =>
    new AppError(400, 'BAD_REQUEST', message),
  conflict: (message: string) =>
    new AppError(409, 'CONFLICT', message),
};
