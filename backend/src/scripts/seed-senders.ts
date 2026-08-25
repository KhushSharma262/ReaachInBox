/**
 * seed-senders.ts
 * Creates 3 Ethereal SMTP test accounts and seeds them into the database.
 * Run with: npm run seed:senders
 *
 * This requires at least one user to exist in the database (you must have
 * logged in at least once via Google OAuth before running this).
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';

async function seedSenders(): Promise<void> {
  logger.info('Creating Ethereal SMTP test accounts...');

  // Find the first user in the database
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true },
  });

  if (!user) {
    logger.error(
      'No users found in the database. Please log in via Google OAuth first, then run this script.',
    );
    process.exit(1);
  }

  logger.info({ userId: user.id, email: user.email }, 'Seeding senders for user');

  const accounts: nodemailer.TestAccount[] = [];

  for (let i = 1; i <= 3; i++) {
    const account = await nodemailer.createTestAccount();
    accounts.push(account);
    logger.info(
      { index: i, user: account.user, host: account.smtp.host },
      `Ethereal account ${i} created`,
    );
  }

  // Upsert each account into the DB (skip if already exists by email)
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const displayName = `Sender ${i + 1} (Ethereal)`;

    const existing = await prisma.senderAccount.findFirst({
      where: { userId: user.id, email: account.user },
    });

    if (existing) {
      logger.info({ email: account.user }, 'Sender already exists, skipping');
      continue;
    }

    await prisma.senderAccount.create({
      data: {
        userId: user.id,
        displayName,
        email: account.user,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpUser: account.user,
        smtpPass: account.pass,
        isActive: true,
      },
    });

    logger.info({ displayName, email: account.user }, 'Sender account created');
  }

  // Print env var suggestions for .env
  logger.info('Add these to your .env file (optional â€” DB already has the values):');
  accounts.forEach((acc, i) => {
    console.log(`ETHEREAL_USER_${i + 1}="${acc.user}"`);
    console.log(`ETHEREAL_PASS_${i + 1}="${acc.pass}"`);
  });

  logger.info('âœ… Sender seeding complete');
  await prisma.$disconnect();
}

seedSenders().catch((err) => {
  logger.fatal({ err }, 'Seed failed');
  process.exit(1);
});
