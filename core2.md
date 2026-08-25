

## FILE: backend\src\api\routes\campaigns.ts
```ts
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { scheduleEmailJob } from '../../lib/queue';
import { requireAuth, assertOwnership } from '../middleware/auth';
import { Errors } from '../middleware/errorHandler';
import { createCampaignSchema, paginationSchema } from '../validators/schemas';
import logger from '../../lib/logger';

const router = Router();

/**
 * POST /api/campaigns
 * Creates a campaign and schedules all email jobs in BullMQ.
 *
 * Strategy for atomicity:
 * 1. Insert Campaign + all ScheduledEmail rows in a single Prisma transaction.
 * 2. After the transaction commits, enqueue BullMQ jobs.
 * 3. If BullMQ enqueue fails, the DB records exist with status=SCHEDULED.
 *    The reconciliation script (run at worker startup) detects orphaned
 *    SCHEDULED records with no corresponding BullMQ job and re-enqueues them.
 */
router.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createCampaignSchema.parse(req.body);
      const userId = req.user!.id;

      const startAt = new Date(input.scheduledStartAt);

      // â”€â”€ Step 1: DB transaction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const campaign = await prisma.$transaction(async (tx) => {
        const newCampaign = await tx.campaign.create({
          data: {
            userId,
            subject: input.subject,
            body: input.body,
            scheduledStartAt: startAt,
            minDelayMs: input.minDelayMs,
            maxPerHour: input.maxPerHour,
            totalRecipients: input.recipientEmails.length,
            status: 'ACTIVE',
          },
        });

        // Create one ScheduledEmail per recipient
        // Delay is computed per-email: email[i] sends at startAt + (i * minDelayMs)
        const emails = input.recipientEmails.map((email, index) => ({
          campaignId: newCampaign.id,
          recipientEmail: email,
          scheduledAt: new Date(startAt.getTime() + index * input.minDelayMs),
          status: 'SCHEDULED' as const,
        }));

        await tx.scheduledEmail.createMany({
          data: emails,
          skipDuplicates: true, // Idempotency: skip if (campaignId, email) already exists
        });

        return newCampaign;
      });

      logger.info(
        { campaignId: campaign.id, recipients: input.recipientEmails.length },
        'Campaign created in DB',
      );

      // â”€â”€ Step 2: Fetch created emails and enqueue BullMQ jobs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const scheduledEmails = await prisma.scheduledEmail.findMany({
        where: { campaignId: campaign.id },
        select: { id: true, recipientEmail: true, scheduledAt: true },
        orderBy: { scheduledAt: 'asc' },
      });

      // Enqueue all jobs â€” errors here are caught and logged but don't fail
      // the API response. The reconciliation script handles re-enqueue.
      let enqueuedCount = 0;
      for (const email of scheduledEmails) {
        try {
          const delayMs = Math.max(0, email.scheduledAt.getTime() - Date.now());

          await scheduleEmailJob(
            {
              scheduledEmailId: email.id,
              campaignId: campaign.id,
              userId,
              recipientEmail: email.recipientEmail,
              subject: input.subject,
              body: input.body,
              maxPerHour: input.maxPerHour,
            },
            delayMs,
          );

          enqueuedCount++;
        } catch (enqueueErr) {
          logger.error(
            { err: enqueueErr, emailId: email.id },
            'Failed to enqueue email job â€” will be recovered on worker startup',
          );
        }
      }

      logger.info(
        { campaignId: campaign.id, enqueuedCount },
        'Campaign jobs enqueued',
      );

      res.status(201).json({
        success: true,
        data: {
          campaignId: campaign.id,
          totalRecipients: input.recipientEmails.length,
          enqueuedCount,
          scheduledStartAt: input.scheduledStartAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/campaigns
 * Returns paginated list of campaigns for the authenticated user.
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const userId = req.user!.id;
      const skip = (page - 1) * limit;

      const [campaigns, total] = await Promise.all([
        prisma.campaign.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            subject: true,
            status: true,
            totalRecipients: true,
            sentCount: true,
            failedCount: true,
            scheduledStartAt: true,
            minDelayMs: true,
            maxPerHour: true,
            createdAt: true,
          },
        }),
        prisma.campaign.count({ where: { userId } }),
      ]);

      res.json({
        success: true,
        data: campaigns,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/campaigns/:id
 * Returns a single campaign with stats.
 */
router.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: req.params.id },
        include: {
          _count: {
            select: { scheduledEmails: true },
          },
        },
      });

      if (!campaign) throw Errors.notFound('Campaign');
      assertOwnership(campaign.userId, req.user!.id);

      res.json({ success: true, data: campaign });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/campaigns/:id
 * Cancels a campaign and marks all scheduled emails as CANCELLED.
 */
router.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: req.params.id },
        select: { id: true, userId: true, status: true },
      });

      if (!campaign) throw Errors.notFound('Campaign');
      assertOwnership(campaign.userId, req.user!.id);

      if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
        throw Errors.badRequest(
          `Campaign is already ${campaign.status.toLowerCase()}`,
        );
      }

      await prisma.$transaction([
        prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'CANCELLED' },
        }),
        prisma.scheduledEmail.updateMany({
          where: { campaignId: campaign.id, status: 'SCHEDULED' },
          data: { status: 'CANCELLED' },
        }),
      ]);

      res.json({ success: true, data: { id: campaign.id, status: 'CANCELLED' } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

```


## FILE: backend\src\lib\redis.ts
```ts
import Redis from 'ioredis';
import { config } from '../config';
import logger from './logger';

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(config.redis.url, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      lazyConnect: false,
    });

    redisInstance.on('connect', () => {
      logger.info('Redis connected');
    });

    redisInstance.on('error', (err: Error) => {
      logger.error({ err }, 'Redis connection error');
    });

    redisInstance.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redisInstance;
}

/**
 * Creates a separate Redis client â€” BullMQ requires dedicated connections
 * for Queue vs Worker to avoid blocking issues.
 */
export function createRedisClient(): Redis {
  return new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    logger.info('Redis disconnected');
  }
}

```
