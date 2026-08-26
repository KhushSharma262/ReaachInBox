import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { createRedisClient, getRedis } from '../lib/redis';
import { QUEUE_NAME, EmailJobData, scheduleEmailJob } from '../lib/queue';
import { checkAndIncrementRateLimit, msUntilNextHourWindow } from '../lib/rateLimiter';
import { sendEmail, selectSender } from '../services/emailSender';
import { prisma, connectDB, disconnectDB } from '../lib/prisma';
import { reconcileOrphanedJobs } from './reconcile';
import logger from '../lib/logger';

/**
 * Ordering note: we CLAIM the row (CAS) BEFORE consuming a rate-limit slot.
 * The reverse leaks slots — a job losing the CAS race would still burn a slot,
 * silently lowering the effective hourly cap.
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { scheduledEmailId, campaignId, userId, recipientEmail, subject, body, maxPerHour } =
    job.data;

  logger.info({ jobId: job.id, scheduledEmailId, recipientEmail }, 'Processing email job');

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });

  if (!campaign || campaign.status === 'CANCELLED') {
    await prisma.scheduledEmail.updateMany({
      where: { id: scheduledEmailId, status: { in: ['SCHEDULED', 'RESCHEDULED'] } },
      data: { status: 'CANCELLED' },
    });
    logger.info({ campaignId, scheduledEmailId }, 'Campaign cancelled — skipping');
    return;
  }

  // Atomic CAS claim. Columns are quoted: @@map renames the TABLE only, so
  // Prisma columns stay camelCase and unquoted identifiers fold to lowercase.
  const claimed = await prisma.$executeRaw`
    UPDATE scheduled_emails
    SET status = 'PROCESSING'::"EmailStatus", "updatedAt" = NOW()
    WHERE id = ${scheduledEmailId}
      AND status IN ('SCHEDULED'::"EmailStatus", 'RESCHEDULED'::"EmailStatus")
  `;

  if (claimed === 0) {
    logger.warn({ scheduledEmailId }, 'Already claimed or terminal — skipping');
    return;
  }

  const redis = getRedis();
  const canSend = await checkAndIncrementRateLimit(redis, campaignId, maxPerHour);

  if (!canSend) {
    const n = (job.data.rescheduleCount ?? 0) + 1;
    const delayMs = msUntilNextHourWindow() + n * config.worker.minEmailDelayMs;
    const nextAt = new Date(Date.now() + delayMs);

    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: 'RESCHEDULED', scheduledAt: nextAt },
    });

    // Distinct jobId REQUIRED: current job is still active and completed IDs
    // are retained 24h, so reusing it would be silently dropped by BullMQ.
    await scheduleEmailJob(
      { ...job.data, rescheduleCount: n },
      delayMs,
      scheduledEmailId + '-r' + n,
    );

    logger.info({ scheduledEmailId, delayMs, nextAt }, 'Rate limited — rescheduled');
    return;
  }

  const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
  const sender = await selectSender(userId);

  if (!sender) {
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: isFinalAttempt ? 'FAILED' : 'SCHEDULED',
        errorMessage: 'No active sender account configured.',
        attempts: { increment: 1 },
      },
    });
    throw new Error('No active sender account');
  }

  try {
    const result = await sendEmail({
      scheduledEmailId,
      senderAccountId: sender.id,
      fromEmail: sender.email,
      fromName: sender.displayName,
      toEmail: recipientEmail,
      subject,
      body,
      smtp: sender.smtp,
    });

    await prisma.$transaction([
      prisma.scheduledEmail.update({
        where: { id: scheduledEmailId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          senderAccountId: sender.id,
          previewUrl: result.previewUrl,
          errorMessage: null,
          attempts: { increment: 1 },
        },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } },
      }),
    ]);

    logger.info(
      { scheduledEmailId, recipientEmail, previewUrl: result.previewUrl },
      'Email sent',
    );
  } catch (smtpErr) {
    const errorMessage = smtpErr instanceof Error ? smtpErr.message : 'Unknown SMTP error';

    // Only write terminal FAILED on the last attempt. Writing it early would
    // make the CAS above fail on every retry, silently killing BullMQ retries.
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: isFinalAttempt ? 'FAILED' : 'SCHEDULED',
        errorMessage,
        attempts: { increment: 1 },
      },
    });

    if (isFinalAttempt) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { failedCount: { increment: 1 } },
      });
    }

    logger.error({ err: smtpErr, scheduledEmailId, isFinalAttempt }, 'SMTP send failed');
    throw smtpErr;
  }
}

async function startWorker(): Promise<void> {
  await connectDB();
  await reconcileOrphanedJobs();

  const worker = new Worker<EmailJobData>(QUEUE_NAME, processEmailJob, {
    connection: createRedisClient(),
    concurrency: config.worker.concurrency,
    stalledInterval: 30_000,
    maxStalledCount: 1,
  });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Job completed'));
  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err, attemptsMade: job?.attemptsMade }, 'Job failed'),
  );
  worker.on('stalled', (jobId) => logger.warn({ jobId }, 'Job stalled — will retry'));
  worker.on('error', (err) => logger.error({ err }, 'Worker error'));

  logger.info(
    { queue: QUEUE_NAME, concurrency: config.worker.concurrency },
    'Email worker started',
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down worker...');
    await worker.close();
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorker().catch((err) => {
  logger.fatal({ err }, 'Worker startup failed');
  process.exit(1);
});
