import { Router, Request, Response, NextFunction } from 'express';
import { EmailStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { Errors } from '../middleware/errorHandler';
import { paginationSchema } from '../validators/schemas';

const router = Router();

// Status groups for cleaner queries
const SCHEDULED_STATUSES: EmailStatus[] = [
  EmailStatus.SCHEDULED,
  EmailStatus.RESCHEDULED,
  EmailStatus.PROCESSING,
];
const COMPLETED_STATUSES: EmailStatus[] = [
  EmailStatus.SENT,
  EmailStatus.FAILED,
  EmailStatus.CANCELLED,
];

/**
 * GET /api/emails/scheduled
 * Returns paginated list of scheduled/in-progress emails.
 */
router.get(
  '/scheduled',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, campaignId } = paginationSchema.parse(req.query);
      const userId = req.user!.id;
      const skip = (page - 1) * limit;

      const where = {
        campaign: { userId },
        ...(campaignId && { campaignId }),
        status: { in: SCHEDULED_STATUSES },
      };

      const [emails, total] = await Promise.all([
        prisma.scheduledEmail.findMany({
          where,
          orderBy: { scheduledAt: 'asc' },
          skip,
          take: limit,
          select: {
            id: true,
            recipientEmail: true,
            status: true,
            scheduledAt: true,
            attempts: true,
            campaign: { select: { id: true, subject: true } },
          },
        }),
        prisma.scheduledEmail.count({ where }),
      ]);

      res.json({
        success: true,
        data: emails,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/emails/sent
 * Returns paginated list of completed (sent/failed/cancelled) emails.
 */
router.get(
  '/sent',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, campaignId } = paginationSchema.parse(req.query);
      const userId = req.user!.id;
      const skip = (page - 1) * limit;

      const where = {
        campaign: { userId },
        ...(campaignId && { campaignId }),
        status: { in: COMPLETED_STATUSES },
      };

      const [emails, total] = await Promise.all([
        prisma.scheduledEmail.findMany({
          where,
          orderBy: { sentAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            recipientEmail: true,
            status: true,
            scheduledAt: true,
            sentAt: true,
            errorMessage: true,
            previewUrl: true,
            attempts: true,
            campaign: { select: { id: true, subject: true } },
            senderAccount: { select: { email: true, displayName: true } },
          },
        }),
        prisma.scheduledEmail.count({ where }),
      ]);

      res.json({
        success: true,
        data: emails,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/emails/:id
 * Returns a single email with full detail.
 */
router.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = await prisma.scheduledEmail.findUnique({
        where: { id: req.params.id },
        include: {
          campaign: { select: { id: true, subject: true, userId: true, body: true } },
          senderAccount: { select: { email: true, displayName: true } },
        },
      });

      if (!email) throw Errors.notFound('Email');
      if (email.campaign.userId !== req.user!.id) throw Errors.forbidden();

      res.json({ success: true, data: email });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
