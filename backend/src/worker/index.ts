import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { createRedisClient } from '../lib/redis';
import { QUEUE_NAME, EmailJobData, scheduleEmailJob } from '../lib/queue';
import { checkAndIncrementRateLimit, msUntilNextHourWindow } from '../lib/rateLimiter';
import { sendEmail, selectSender } from '../services/emailSender';
import { prisma } from '../lib/prisma';
import { connectDB, disconnectDB } from '../lib/prisma';
import logger from '../lib/logger';

/**
 * THE CORE EMAIL WORKER
 *
 * This is a separate Node.js process from the API server.
 * It connects to BullMQ (backed by Redis) and processes email jobs.
 *
 * Job lifecycle in this worker:
 *  1. BullMQ delivers job when delay expires
 *  2. Check rate limit (Redis atomic Lua)
 *     → If exceeded: re-enqueue for next hour, skip
 *  3. Check if campaign is still active
 *  4. Atomic CAS: UPDATE status SCHEDULED→PROCESSING (idempotency guard)
 *     → If 0 rows: another worker already claimed this, skip
 *  5. Select least-recently-used sender
 *  6. Send email via Nodemailer/Ethereal
 *  7. Update DB: status→SENT + previewUrl
 *     OR on failure: status→FAILED + errorMessage
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { scheduledEmailId, campaignId, userId, recipientEmail, subject, body, maxPerHour } =
    job.data;

  logger.info(
    { jobId: job.id, scheduledEmailId, recipientEmail },
    'Processing email job',
  );

  // ── Step 1: Check campaign is not cancelled ──────────────────────────────
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });

  if (!campaign || campaign.status === 'CANCELLED') {
    logger.info({ campaignId, scheduledEmailId }, 'Campaign cancelled, skipping job');
    // Mark the email as cancelled
    await prisma.scheduledEmail.updateMany({
      where: { id: scheduledEmailId, status: { in: ['SCHEDULED', 'RESCHEDULED'] } },
      data: { status: 'CANCELLED' },
    });
    return;
  }

  // ── Step 2: Rate limit check ────────────────────────────────────────────
  const redis = createRedisClient();
  try {
    const canSend = await checkAndIncrementRateLimit(redis, userId, maxPerHour);

    if (!canSend) {
      const delayMs = msUntilNextHourWindow();

      logger.info(
        { scheduledEmailId, userId, delayMs, recipientEmail },
        'Rate limit reached — rescheduling to next hour window',
      );

      // Mark as RESCHEDULED in DB
      await prisma.scheduledEmail.updateMany({
        where: { id: scheduledEmailId, status: { in: ['SCHEDULED', 'RESCHEDULED'] } },
        data: {
          status: 'RESCHEDULED',
          scheduledAt: new Date(Date.now() + delayMs),
        },
      });

      // Re-enqueue with delay — same jobId is fine because BullMQ removes the
      // current job once this processor function returns, so we use a suffixed ID.
      await scheduleEmailJob(
        { ...job.data },
        delayMs,
      );

      return; // Return normally — do not throw, do not mark as failed
    }
  } finally {
    await redis.quit();
  }

  // ── Step 3: Atomic CAS — claim this job (idempotency Layer 3) ───────────
  const updatedCount = await prisma.$executeRaw`
    UPDATE scheduled_emails
    SET status = 'PROCESSING', attempts = attempts + 1, updated_at = NOW()
    WHERE id = ${scheduledEmailId}
    AND status IN ('SCHEDULED', 'RESCHEDULED')
  `;

  if (updatedCount === 0) {
    logger.warn(
      { scheduledEmailId },
      'Job already claimed by another worker — skipping (idempotency guard)',
    );
    return;
  }

  // ── Step 4: Select sender (LRU) ──────────────────────────────────────────
  const sender = await selectSender(userId);

  if (!sender) {
    logger.error({ userId, scheduledEmailId }, 'No active sender account found');
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: 'FAILED',
        errorMessage: 'No active sender account configured. Please add a sender account.',
      },
    });
    throw new Error('No active sender account'); // Will trigger BullMQ retry
  }

  // ── Step 5: Send email ───────────────────────────────────────────────────
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

    // ── Step 6: Mark SENT ────────────────────────────────────────────────
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        senderAccountId: sender.id,
        previewUrl: result.previewUrl,
        errorMessage: null,
      },
    });

    // Increment campaign sentCount
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { sentCount: { increment: 1 } },
    });

    logger.info(
      {
        scheduledEmailId,
        recipientEmail,
        messageId: result.messageId,
        previewUrl: result.previewUrl,
      },
      'Email sent successfully',
    );
  } catch (smtpErr) {
    // ── Step 7: Mark FAILED (will be retried by BullMQ) ─────────────────
    const errorMessage =
      smtpErr instanceof Error ? smtpErr.message : 'Unknown SMTP error';

    logger.error(
      { err: smtpErr, scheduledEmailId, recipientEmail },
      'SMTP send failed',
    );

    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { failedCount: { increment: 1 } },
    });

    // Re-throw so BullMQ knows this job failed and should retry
    throw smtpErr;
  }
}

// ─── Worker startup ───────────────────────────────────────────────────────────

async function startWorker(): Promise<void> {
  await connectDB();

  const worker = new Worker<EmailJobData>(QUEUE_NAME, processEmailJob, {
    connection: createRedisClient(),
    concurrency: config.worker.concurrency,
    // Stalled job detection: if a job is in "active" for > 30s without heartbeat,
    // move it back to failed so it can be retried
    stalledInterval: 30_000,
    maxStalledCount: 1,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, err, attemptsMade: job?.attemptsMade },
      'Job failed',
    );

    // After all retries exhausted, ensure DB reflects FAILED status
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      prisma.scheduledEmail
        .update({
          where: { id: job.data.scheduledEmailId },
          data: {
            status: 'FAILED',
            errorMessage: err instanceof Error ? err.message : 'Max retries exceeded',
          },
        })
        .catch((dbErr) => logger.error({ dbErr }, 'Failed to update terminal failure'));
    }
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Job stalled — will be retried');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  logger.info(
    {
      queue: QUEUE_NAME,
      concurrency: config.worker.concurrency,
    },
    'Email worker started',
  );

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down worker...');
    await worker.close();
    await disconnectDB();
    logger.info('Worker shut down gracefully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorker().catch((err) => {
  logger.fatal({ err }, 'Worker startup failed');
  process.exit(1);
});
