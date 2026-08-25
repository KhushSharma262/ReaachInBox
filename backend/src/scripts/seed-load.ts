/**
 * seed-load.ts
 * Generates 100 scheduled email records for load testing and demo purposes.
 * Run with: npm run seed:load
 *
 * This creates a real campaign in the DB and enqueues jobs in BullMQ.
 * Requires: user in DB, sender accounts in DB, Redis + Postgres running.
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { scheduleEmailJob } from '../lib/queue';
import logger from '../lib/logger';

const LOAD_COUNT = 100;
const MIN_DELAY_MS = 2000;     // 2 seconds between emails
const MAX_PER_HOUR = 50;       // Low hourly limit to demonstrate rescheduling
const START_DELAY_MS = 30_000; // Start 30 seconds from now

function generateTestEmail(index: number): string {
  return `test.recipient.${index + 1}@example-load-test.com`;
}

async function seedLoad(): Promise<void> {
  logger.info({ count: LOAD_COUNT }, 'Starting load seed');

  const user = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });

  if (!user) {
    logger.error('No users found. Please log in first.');
    process.exit(1);
  }

  const scheduledStartAt = new Date(Date.now() + START_DELAY_MS);

  // Create campaign
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      subject: `[LOAD TEST] Bulk Email Demo — ${new Date().toLocaleString()}`,
      body: `This is a load test email #{{INDEX}} to demonstrate the ReachInbox email scheduler.\n\nKey features demonstrated:\n- BullMQ delayed jobs\n- Redis rate limiting (${MAX_PER_HOUR}/hr)\n- Minimum delay between sends (${MIN_DELAY_MS}ms)\n- Automatic rescheduling when rate limit is reached`,
      scheduledStartAt,
      minDelayMs: MIN_DELAY_MS,
      maxPerHour: MAX_PER_HOUR,
      totalRecipients: LOAD_COUNT,
      status: 'ACTIVE',
    },
  });

  logger.info({ campaignId: campaign.id }, 'Campaign created');

  // Generate recipient emails
  const recipients = Array.from({ length: LOAD_COUNT }, (_, i) =>
    generateTestEmail(i),
  );

  // Insert scheduled email records
  await prisma.scheduledEmail.createMany({
    data: recipients.map((email, index) => ({
      campaignId: campaign.id,
      recipientEmail: email,
      scheduledAt: new Date(scheduledStartAt.getTime() + index * MIN_DELAY_MS),
      status: 'SCHEDULED' as const,
    })),
    skipDuplicates: true,
  });

  // Fetch and enqueue
  const scheduledEmails = await prisma.scheduledEmail.findMany({
    where: { campaignId: campaign.id },
    orderBy: { scheduledAt: 'asc' },
    select: { id: true, recipientEmail: true, scheduledAt: true },
  });

  let enqueued = 0;
  for (const email of scheduledEmails) {
    const delayMs = Math.max(0, email.scheduledAt.getTime() - Date.now());
    await scheduleEmailJob(
      {
        scheduledEmailId: email.id,
        campaignId: campaign.id,
        userId: user.id,
        recipientEmail: email.recipientEmail,
        subject: campaign.subject,
        body: campaign.body,
        maxPerHour: MAX_PER_HOUR,
      },
      delayMs,
    );
    enqueued++;
  }

  logger.info(
    {
      campaignId: campaign.id,
      enqueued,
      scheduledStartAt: scheduledStartAt.toISOString(),
      estimatedHoursToComplete: (LOAD_COUNT / MAX_PER_HOUR).toFixed(1),
    },
    `✅ Load seed complete. ${enqueued} jobs enqueued.`,
  );

  console.log('\n📊 Load Test Summary:');
  console.log(`   Campaign ID: ${campaign.id}`);
  console.log(`   Recipients: ${LOAD_COUNT}`);
  console.log(`   Starts at: ${scheduledStartAt.toLocaleString()}`);
  console.log(`   Hourly limit: ${MAX_PER_HOUR}/hr`);
  console.log(`   Min delay: ${MIN_DELAY_MS}ms between emails`);
  console.log(
    `   Estimated completion: ~${(LOAD_COUNT / MAX_PER_HOUR).toFixed(1)} hours`,
  );
  console.log(
    `\n💡 Watch the worker logs to see rate limiting and rescheduling in action.`,
  );

  await prisma.$disconnect();
  process.exit(0);
}

seedLoad().catch((err) => {
  logger.fatal({ err }, 'Load seed failed');
  process.exit(1);
});
