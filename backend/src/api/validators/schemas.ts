import { z } from 'zod';

// ─── Campaign ─────────────────────────────────────────────────────────────────

export const createCampaignSchema = z.object({
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(255, 'Subject must be under 255 characters'),
  body: z
    .string()
    .min(1, 'Body is required')
    .max(50_000, 'Body must be under 50,000 characters'),
  recipientEmails: z
    .array(z.string().email('Invalid email address'))
    .min(1, 'At least one recipient email is required')
    .max(10_000, 'Maximum 10,000 recipients per campaign'),
  scheduledStartAt: z
    .string()
    .datetime({ message: 'scheduledStartAt must be a valid ISO 8601 datetime' })
    .refine(
      (val) => new Date(val) > new Date(Date.now() + 60_000),
      'Scheduled time must be at least 1 minute in the future',
    ),
  minDelayMs: z
    .number()
    .int()
    .min(0, 'Delay cannot be negative')
    .max(300_000, 'Delay cannot exceed 5 minutes (300,000ms)')
    .default(2000),
  maxPerHour: z
    .number()
    .int()
    .min(1, 'Hourly limit must be at least 1')
    .max(10_000, 'Hourly limit cannot exceed 10,000')
    .default(200),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

// ─── Pagination ───────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
  campaignId: z.string().cuid().optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ─── Sender Account ───────────────────────────────────────────────────────────

export const createSenderSchema = z.object({
  displayName: z.string().min(1).max(100),
  email: z.string().email(),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().min(1),
  smtpPass: z.string().min(1),
});

export type CreateSenderInput = z.infer<typeof createSenderSchema>;
