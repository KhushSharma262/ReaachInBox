import { getEmailQueue, scheduleEmailJob, EmailJobData } from '../lib/queue';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';

/**
 * Recovers DB rows whose BullMQ job was lost.
 *
 * The API writes to Postgres and Redis in sequence — they cannot share one
 * transaction. If the DB commit succeeds but the enqueue fails (Redis blip,
 * crash between the two), the row sits at SCHEDULED with no job and would
 * never be sent. This runs at worker startup and re-enqueues them.
 *
 * This is the "controlled queue insertion + reconciliation" strategy: cheaper
 * than a full transactional outbox, and sufficient because the DB is the source
 * of truth and re-enqueueing is idempotent (status CAS + unique constraint).
 */
export async function reconcileOrphanedJobs(): Promise<number> {
  const queue = getEmailQueue();

  const pending = await prisma.scheduledEmail.findMany({
    where: {
      status: { in: ['SCHEDULED', 'RESCHEDULED'] },
      campaign: { status: 'ACTIVE' },
    },
    select: {
      id: true,
      recipientEmail: true,
      scheduledAt: true,
      campaign: {
        select: { id: true, userId: true, subject: true, body: true, maxPerHour: true },
      },
    },
  });

  if (pending.length === 0) {
    logger.info('Reconciliation: no pending emails');
    return 0;
  }

  let recovered = 0;

  for (const row of pending) {
    const existing = await queue.getJob(row.id);
    if (existing) continue;

    const data: EmailJobData = {
      scheduledEmailId: row.id,
      campaignId: row.campaign.id,
      userId: row.campaign.userId,
      recipientEmail: row.recipientEmail,
      subject: row.campaign.subject,
      body: row.campaign.body,
      maxPerHour: row.campaign.maxPerHour,
    };

    const delayMs = Math.max(0, row.scheduledAt.getTime() - Date.now());
    await scheduleEmailJob(data, delayMs, row.id + ':rec' + Date.now());
    recovered++;
  }

  logger.info({ scanned: pending.length, recovered }, 'Reconciliation complete');
  return recovered;
}
