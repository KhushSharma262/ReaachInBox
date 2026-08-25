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
 * jobId = scheduledEmailId (cuid from DB) — ensures idempotency at BullMQ level.
 */
export async function scheduleEmailJob(
  data: EmailJobData,
  delayMs: number,
): Promise<void> {
  const queue = getEmailQueue();

  await queue.add(QUEUE_NAME, data, {
    jobId: data.scheduledEmailId, // Duplicate jobId → BullMQ ignores silently
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
