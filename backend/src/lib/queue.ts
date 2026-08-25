import { Queue } from 'bullmq';
import { createRedisClient } from './redis';
import logger from './logger';

export const QUEUE_NAME = 'email-campaign';

export interface EmailJobData {
  scheduledEmailId: string; // Used as jobId — the primary idempotency key
  campaignId: string;
  userId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  maxPerHour: number;
  rescheduleCount?: number; // Incremented each time a rate limit defers this job
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
 *
 * jobId defaults to scheduledEmailId (cuid from DB), which gives BullMQ-level
 * idempotency: enqueueing the same email twice is silently ignored.
 *
 * When a job is deferred by the rate limiter, the worker MUST pass a distinct
 * jobIdOverride (e.g. `${id}:r1`). The original job is still `active` at that
 * moment, and completed job IDs are retained for 24h by removeOnComplete —
 * so reusing the ID would cause BullMQ to drop the re-enqueue silently and the
 * email would never be sent. Duplicate-send safety does not depend on the jobId:
 * it is enforced by the DB status CAS and the unique
 * (campaignId, recipientEmail) constraint.
 */
export async function scheduleEmailJob(
  data: EmailJobData,
  delayMs: number,
  jobIdOverride?: string,
): Promise<void> {
  const queue = getEmailQueue();
  const jobId = jobIdOverride ?? data.scheduledEmailId;

  await queue.add(QUEUE_NAME, data, {
    jobId,
    delay: delayMs,
  });

  logger.debug(
    { jobId, recipientEmail: data.recipientEmail, delayMs },
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