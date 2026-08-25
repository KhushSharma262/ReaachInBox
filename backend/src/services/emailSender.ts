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

  // Ethereal returns a preview URL — extremely useful for demos
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
 * simultaneously (though it's not strictly required for correctness —
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
