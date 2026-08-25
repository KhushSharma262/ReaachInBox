import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth, assertOwnership } from '../middleware/auth';
import { Errors } from '../middleware/errorHandler';
import { createSenderSchema } from '../validators/schemas';

const router = Router();

/**
 * GET /api/senders
 * Returns all active sender accounts for the authenticated user.
 * SMTP password is never returned to the client.
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const senders = await prisma.senderAccount.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          displayName: true,
          email: true,
          smtpHost: true,
          smtpPort: true,
          smtpUser: true,
          isActive: true,
          lastUsedAt: true,
          createdAt: true,
          // smtpPass intentionally omitted
        },
      });

      res.json({ success: true, data: senders });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/senders
 * Creates a new sender account for the authenticated user.
 */
router.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createSenderSchema.parse(req.body);
      const userId = req.user!.id;

      const sender = await prisma.senderAccount.create({
        data: {
          userId,
          displayName: input.displayName,
          email: input.email,
          smtpHost: input.smtpHost,
          smtpPort: input.smtpPort,
          smtpUser: input.smtpUser,
          smtpPass: input.smtpPass,
          isActive: true,
        },
        select: {
          id: true,
          displayName: true,
          email: true,
          smtpHost: true,
          smtpPort: true,
          smtpUser: true,
          isActive: true,
          createdAt: true,
        },
      });

      res.status(201).json({ success: true, data: sender });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/senders/:id
 * Soft-deletes (deactivates) a sender account.
 */
router.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sender = await prisma.senderAccount.findUnique({
        where: { id: req.params.id },
        select: { id: true, userId: true },
      });

      if (!sender) throw Errors.notFound('Sender account');
      assertOwnership(sender.userId, req.user!.id);

      await prisma.senderAccount.update({
        where: { id: sender.id },
        data: { isActive: false },
      });

      res.json({ success: true, data: { id: sender.id } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
