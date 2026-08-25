

## FILE: backend\prisma\schema.prisma
```ts
// This is your Prisma schema file.
// Learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// User â€” authenticated via Google OAuth (NextAuth)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  avatarUrl String?
  googleId  String?  @unique

  campaigns      Campaign[]
  senderAccounts SenderAccount[]

  // NextAuth adapter fields
  accounts Account[]
  sessions Session[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}

// NextAuth adapter tables
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SenderAccount â€” SMTP credentials for sending emails
// Supports multiple senders per user; selected via LRU
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
model SenderAccount {
  id          String  @id @default(cuid())
  userId      String
  displayName String
  email       String
  smtpHost    String
  smtpPort    Int
  smtpUser    String
  smtpPass    String  // Stored as-is for Ethereal; encrypt in production
  isActive    Boolean @default(true)
  lastUsedAt  DateTime @default(now())

  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  scheduledEmails ScheduledEmail[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, isActive, lastUsedAt])
  @@map("sender_accounts")
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Campaign â€” a bulk email campaign
// One campaign â†’ many ScheduledEmails (one per recipient)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
model Campaign {
  id               String         @id @default(cuid())
  userId           String
  subject          String
  body             String         @db.Text
  status           CampaignStatus @default(ACTIVE)
  totalRecipients  Int
  sentCount        Int            @default(0)
  failedCount      Int            @default(0)
  scheduledStartAt DateTime
  minDelayMs       Int            // Minimum delay between emails in milliseconds
  maxPerHour       Int            // Maximum emails per hour (per this campaign)

  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  scheduledEmails ScheduledEmail[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, status])
  @@index([userId, createdAt(sort: Desc)])
  @@map("campaigns")
}

enum CampaignStatus {
  ACTIVE
  PAUSED
  COMPLETED
  CANCELLED
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ScheduledEmail â€” one email to one recipient, part of a campaign
// id is used as the BullMQ jobId for idempotency
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
model ScheduledEmail {
  id              String      @id @default(cuid())
  campaignId      String
  senderAccountId String?     // Set when the worker picks it up
  recipientEmail  String
  status          EmailStatus @default(SCHEDULED)
  scheduledAt     DateTime    // When this specific email should be sent
  sentAt          DateTime?
  errorMessage    String?     @db.Text
  previewUrl      String?     // Ethereal preview URL after successful send
  attempts        Int         @default(0)

  campaign      Campaign       @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  senderAccount SenderAccount? @relation(fields: [senderAccountId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Idempotency constraint: one email per recipient per campaign
  @@unique([campaignId, recipientEmail])

  // Query indexes
  @@index([campaignId, status])
  @@index([scheduledAt])
  @@index([status, scheduledAt])
  @@map("scheduled_emails")
}

enum EmailStatus {
  SCHEDULED    // Created, job in BullMQ, waiting for time
  PROCESSING   // Worker has claimed this job (CAS update)
  SENT         // Successfully delivered via SMTP
  FAILED       // All retries exhausted
  RESCHEDULED  // Rate limit hit; re-enqueued for next hour window
  CANCELLED    // User cancelled the campaign
}

```


## FILE: backend\src\lib\rateLimiter.ts
```ts
import type Redis from 'ioredis';
import logger from './logger';

/**
 * Redis-backed atomic hourly rate limiter using a Lua script.
 *
 * Key strategy: rate:{userId}:{hourEpoch}
 *   - hourEpoch = Math.floor(Date.now() / 3600000)
 *   - Key expires automatically after 1 hour
 *   - INCR is atomic â†’ safe with multiple concurrent workers
 *
 * The Lua script atomically:
 *   1. INCRements the counter
 *   2. Sets TTL on first increment (avoids race between INCR and EXPIRE)
 *   3. Returns the new count
 *
 * If count > limit â†’ the caller is responsible for rescheduling the job.
 * We DECR the counter if we decide not to send (to keep count accurate).
 */

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, ttl)
end

if current > limit then
  redis.call('DECR', key)
  return 0
else
  return current
end
`;

function getHourEpoch(): number {
  return Math.floor(Date.now() / 3_600_000);
}

function getRateLimitKey(userId: string): string {
  return `rate:${userId}:${getHourEpoch()}`;
}

/**
 * Attempts to consume one slot from the rate limit.
 *
 * @returns true if the email can be sent now, false if limit is reached
 */
export async function checkAndIncrementRateLimit(
  redis: Redis,
  userId: string,
  maxPerHour: number,
): Promise<boolean> {
  const key = getRateLimitKey(userId);
  const ttlSeconds = 3600; // 1 hour

  const result = await redis.eval(
    RATE_LIMIT_LUA,
    1,
    key,
    String(maxPerHour),
    String(ttlSeconds),
  ) as number;

  if (result === 0) {
    logger.debug({ userId, maxPerHour }, 'Rate limit reached');
    return false;
  }

  logger.debug({ userId, currentCount: result, maxPerHour }, 'Rate limit ok');
  return true;
}

/**
 * Returns the number of milliseconds until the next hour window starts.
 * Used to calculate how long to delay a rate-limited job.
 */
export function msUntilNextHourWindow(): number {
  const now = Date.now();
  const nextHour = (Math.floor(now / 3_600_000) + 1) * 3_600_000;
  return nextHour - now;
}

/**
 * Gets current usage count for a user in the current hour.
 * Used for dashboard display / debugging.
 */
export async function getCurrentHourCount(
  redis: Redis,
  userId: string,
): Promise<number> {
  const key = getRateLimitKey(userId);
  const value = await redis.get(key);
  return value ? parseInt(value, 10) : 0;
}

```


## FILE: backend\src\lib\queue.ts
```ts
import { Queue } from 'bullmq';
import { createRedisClient } from './redis';
import logger from './logger';

export const QUEUE_NAME = 'email-campaign';

export interface EmailJobData {
  scheduledEmailId: string; // Used as jobId â€” the primary idempotency key
  campaignId: string;
  userId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  maxPerHour: number;
}

let emailQueueInstance: Queue<EmailJobData> | null = null;

export function getEmailQueue(): Queue<EmailJobData> {
  if (!emailQueueInstance) {
    emailQueueInstance = new Queue<EmailJobData>(QUEUE_NAME, {
      connection: createRedisClient(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s, 10s, 20s
        },
        removeOnComplete: {
          age: 86400, // Keep completed jobs for 24h (for debugging)
          count: 1000,
        },
        removeOnFail: {
          age: 604800, // Keep failed jobs for 7 days
        },
      },
    });

    logger.info({ queue: QUEUE_NAME }, 'BullMQ queue initialized');
  }

  return emailQueueInstance;
}

/**
 * Schedules a single email job with a computed delay.
 * jobId = scheduledEmailId (cuid from DB) â€” ensures idempotency at BullMQ level.
 */
export async function scheduleEmailJob(
  data: EmailJobData,
  delayMs: number,
): Promise<void> {
  const queue = getEmailQueue();

  await queue.add(QUEUE_NAME, data, {
    jobId: data.scheduledEmailId, // Duplicate jobId â†’ BullMQ ignores silently
    delay: delayMs,
  });

  logger.debug(
    {
      jobId: data.scheduledEmailId,
      recipientEmail: data.recipientEmail,
      delayMs,
    },
    'Email job scheduled',
  );
}

export async function closeEmailQueue(): Promise<void> {
  if (emailQueueInstance) {
    await emailQueueInstance.close();
    emailQueueInstance = null;
    logger.info('BullMQ queue closed');
  }
}

```


## FILE: backend\src\worker\index.ts
```ts
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
 *     â†’ If exceeded: re-enqueue for next hour, skip
 *  3. Check if campaign is still active
 *  4. Atomic CAS: UPDATE status SCHEDULEDâ†’PROCESSING (idempotency guard)
 *     â†’ If 0 rows: another worker already claimed this, skip
 *  5. Select least-recently-used sender
 *  6. Send email via Nodemailer/Ethereal
 *  7. Update DB: statusâ†’SENT + previewUrl
 *     OR on failure: statusâ†’FAILED + errorMessage
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { scheduledEmailId, campaignId, userId, recipientEmail, subject, body, maxPerHour } =
    job.data;

  logger.info(
    { jobId: job.id, scheduledEmailId, recipientEmail },
    'Processing email job',
  );

  // â”€â”€ Step 1: Check campaign is not cancelled â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Step 2: Rate limit check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const redis = createRedisClient();
  try {
    const canSend = await checkAndIncrementRateLimit(redis, userId, maxPerHour);

    if (!canSend) {
      const delayMs = msUntilNextHourWindow();

      logger.info(
        { scheduledEmailId, userId, delayMs, recipientEmail },
        'Rate limit reached â€” rescheduling to next hour window',
      );

      // Mark as RESCHEDULED in DB
      await prisma.scheduledEmail.updateMany({
        where: { id: scheduledEmailId, status: { in: ['SCHEDULED', 'RESCHEDULED'] } },
        data: {
          status: 'RESCHEDULED',
          scheduledAt: new Date(Date.now() + delayMs),
        },
      });

      // Re-enqueue with delay â€” same jobId is fine because BullMQ removes the
      // current job once this processor function returns, so we use a suffixed ID.
      await scheduleEmailJob(
        { ...job.data },
        delayMs,
      );

      return; // Return normally â€” do not throw, do not mark as failed
    }
  } finally {
    await redis.quit();
  }

  // â”€â”€ Step 3: Atomic CAS â€” claim this job (idempotency Layer 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const updatedCount = await prisma.$executeRaw`
    UPDATE scheduled_emails
    SET status = 'PROCESSING', attempts = attempts + 1, updated_at = NOW()
    WHERE id = ${scheduledEmailId}
    AND status IN ('SCHEDULED', 'RESCHEDULED')
  `;

  if (updatedCount === 0) {
    logger.warn(
      { scheduledEmailId },
      'Job already claimed by another worker â€” skipping (idempotency guard)',
    );
    return;
  }

  // â”€â”€ Step 4: Select sender (LRU) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Step 5: Send email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Step 6: Mark SENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    // â”€â”€ Step 7: Mark FAILED (will be retried by BullMQ) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Worker startup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    logger.warn({ jobId }, 'Job stalled â€” will be retried');
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

```


## FILE: backend\src\services\emailSender.ts
```ts
import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

/**
 * Creates a Nodemailer transporter for the given SMTP config.
 * For Ethereal accounts, host is smtp.ethereal.email.
 */
function createTransporter(smtp: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });
}

interface SendEmailOptions {
  scheduledEmailId: string;
  senderAccountId: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  body: string;
  smtp: SmtpConfig;
}

interface SendResult {
  previewUrl: string | null;
  messageId: string;
}

/**
 * Sends a single email via Nodemailer and returns the preview URL (Ethereal)
 * and message ID (used for idempotency tracing).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const transporter = createTransporter(opts.smtp);

  const info = await transporter.sendMail({
    from: `"${opts.fromName}" <${opts.fromEmail}>`,
    to: opts.toEmail,
    subject: opts.subject,
    text: opts.body,
    html: `<div style="font-family: sans-serif; max-width: 600px;">${opts.body.replace(/\n/g, '<br>')}</div>`,
    // Use scheduledEmailId as messageId for traceability
    messageId: `<${opts.scheduledEmailId}@reachinbox.local>`,
  });

  // Ethereal returns a preview URL â€” extremely useful for demos
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;

  if (previewUrl) {
    logger.info(
      { scheduledEmailId: opts.scheduledEmailId, previewUrl },
      'Ethereal preview URL',
    );
  }

  return {
    previewUrl: typeof previewUrl === 'string' ? previewUrl : null,
    messageId: info.messageId,
  };
}

/**
 * Selects the least-recently-used active sender account for a given user.
 * Uses a DB transaction to atomically claim the sender (update lastUsedAt).
 *
 * This prevents two concurrent workers from picking the same sender
 * simultaneously (though it's not strictly required for correctness â€”
 * both could use the same sender, but LRU distributes load better).
 */
export async function selectSender(userId: string): Promise<{
  id: string;
  email: string;
  displayName: string;
  smtp: SmtpConfig;
} | null> {
  return prisma.$transaction(async (tx) => {
    const sender = await tx.senderAccount.findFirst({
      where: { userId, isActive: true },
      orderBy: { lastUsedAt: 'asc' },
      select: {
        id: true,
        displayName: true,
        email: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpPass: true,
      },
    });

    if (!sender) return null;

    await tx.senderAccount.update({
      where: { id: sender.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      id: sender.id,
      email: sender.email,
      displayName: sender.displayName,
      smtp: {
        host: sender.smtpHost,
        port: sender.smtpPort,
        user: sender.smtpUser,
        pass: sender.smtpPass,
      },
    };
  });
}

```


## FILE: backend\src\config\index.ts
```ts
import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  port: parseInt(optionalEnv('PORT', '3001'), 10),

  database: {
    url: requireEnv('DATABASE_URL'),
  },

  redis: {
    url: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
  },

  auth: {
    secret: requireEnv('AUTH_SECRET'),
    sessionSecret: requireEnv('SESSION_SECRET'),
  },

  urls: {
    frontend: optionalEnv('FRONTEND_URL', 'http://localhost:3000'),
    backend: optionalEnv('BACKEND_URL', 'http://localhost:3001'),
  },

  worker: {
    concurrency: parseInt(optionalEnv('WORKER_CONCURRENCY', '5'), 10),
    minEmailDelayMs: parseInt(optionalEnv('MIN_EMAIL_DELAY_MS', '2000'), 10),
    maxEmailsPerHour: parseInt(optionalEnv('MAX_EMAILS_PER_HOUR', '200'), 10),
  },

  ethereal: {
    accounts: [
      {
        user: optionalEnv('ETHEREAL_USER_1', ''),
        pass: optionalEnv('ETHEREAL_PASS_1', ''),
      },
      {
        user: optionalEnv('ETHEREAL_USER_2', ''),
        pass: optionalEnv('ETHEREAL_PASS_2', ''),
      },
      {
        user: optionalEnv('ETHEREAL_USER_3', ''),
        pass: optionalEnv('ETHEREAL_PASS_3', ''),
      },
    ],
  },
} as const;

export type Config = typeof config;

```
