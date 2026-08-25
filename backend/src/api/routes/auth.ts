import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 */
router.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          createdAt: true,
          _count: {
            select: { campaigns: true },
          },
        },
      });

      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
