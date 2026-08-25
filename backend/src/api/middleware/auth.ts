import { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";
import { config } from "../../config";
import { prisma } from "../../lib/prisma";
import { Errors } from "./errorHandler";
import logger from "../../lib/logger";

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
 * Verifies the API token minted by the Next.js /api/token route.
 *
 * NextAuth v4 stores its own session as an encrypted JWE, which this service
 * cannot verify with a plain signature check. Rather than couple the API to
 * NextAuth internals, the frontend exchanges its session for a short-lived
 * HS256 JWT signed with the shared AUTH_SECRET, sent as a Bearer token.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sessionToken =
      req.headers.authorization?.replace("Bearer ", "") ||
      req.cookies?.["next-auth.session-token"];

    if (!sessionToken) {
      throw Errors.unauthorized();
    }

    const secret = new TextEncoder().encode(config.auth.secret);
    const { payload } = await jwtVerify(sessionToken, secret, {
      algorithms: ["HS256"],
      issuer: "reachinbox-web",
      audience: "reachinbox-api",
    });

    if (!payload.email || typeof payload.email !== "string") {
      throw Errors.unauthorized();
    }

    // Upsert: identity is established by the verified token, so the local row
    // is created lazily on first API call rather than requiring a signup step.
    const user = await prisma.user.upsert({
      where: { email: payload.email },
      update: {},
      create: {
        email: payload.email,
        name: typeof payload.name === "string" ? payload.name : null,
        avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
      },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    req.user = user;
    next();
  } catch (err) {
    if ((err as { name?: string }).name === "JWTExpired") {
      res.status(401).json({
        success: false,
        error: { code: "TOKEN_EXPIRED", message: "Session expired. Please log in again." },
      });
      return;
    }
    logger.warn({ err }, "Auth rejected");
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }
}

/**
 * Validates that a resource belongs to the authenticated user.
 */
export function assertOwnership(resourceUserId: string, requestUserId: string): void {
  if (resourceUserId !== requestUserId) {
    throw Errors.forbidden();
  }
}
