import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import { config } from '../../config';
import { prisma } from '../../lib/prisma';
import { Errors } from './errorHandler';
import logger from '../../lib/logger';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string | null;
        avatarUrl: string | null;
      };
    }
  }
}

/**
 * Validates the NextAuth session token sent from the frontend.
 *
 * NextAuth v5 issues a JWT stored in an HttpOnly cookie (session-token).
 * We verify it using the shared AUTH_SECRET. Once verified, we load the
 * full user from PostgreSQL and attach it to req.user.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // NextAuth sends the session token as a cookie or Authorization header
    const sessionToken =
      req.cookies?.['authjs.session-token'] ||
      req.cookies?.['next-auth.session-token'] ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      throw Errors.unauthorized();
    }

    // Verify JWT signature using AUTH_SECRET
    const secret = new TextEncoder().encode(config.auth.secret);
    const { payload } = await jwtVerify(sessionToken, secret, {
      algorithms: ['HS256'],
    });

    if (!payload.email || typeof payload.email !== 'string') {
      throw Errors.unauthorized();
    }

    // Look up the user in PostgreSQL
    const user = await prisma.user.findUnique({
      where: { email: payload.email },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    if (!user) {
      throw Errors.unauthorized();
    }

    req.user = user;
    next();
  } catch (err) {
    if ((err as { name?: string }).name === 'JWTExpired') {
      res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Session expired. Please log in again.' } });
      return;
    }
    if ((err as { statusCode?: number }).statusCode === 401) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }
    logger.error({ err }, 'Auth middleware error');
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }
}

/**
 * Validates that a resource belongs to the authenticated user.
 * Used inline in route handlers.
 */
export function assertOwnership(
  resourceUserId: string,
  requestUserId: string,
): void {
  if (resourceUserId !== requestUserId) {
    throw Errors.forbidden();
  }
}
