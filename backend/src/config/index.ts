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
