import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import logger from './lib/logger';
import { connectDB, disconnectDB } from './lib/prisma';
import { errorHandler } from './api/middleware/errorHandler';

// Routes
import authRoutes from './api/routes/auth';
import campaignRoutes from './api/routes/campaigns';
import emailRoutes from './api/routes/emails';
import uploadRoutes from './api/routes/upload';
import senderRoutes from './api/routes/senders';

// Worker — started in-process since this Render deployment doesn't run
// a separate worker service (free-tier constraint). This file self-starts
// on import (see startWorker().catch(...) at its bottom).
import './worker';

const app = express();
app.disable('x-powered-by');

// ─── Security middleware ─────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(
  cors({
    origin: config.urls.frontend,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ─── Body parsing ─────────────────────────────────────────────────
const readLimiter = rateLimit({
  windowMs: 60000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
});

const writeLimiter = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many campaigns created.' } },
});

app.use('/api', readLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

// ─── HTTP request logging ─────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
    skip: (_req, res) => res.statusCode < 400 && config.nodeEnv === 'production',
  }),
);

// ─── Health check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── API Routes ─────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', writeLimiter, campaignRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/senders', senderRoutes);

// 404 handler — must be after all routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// ─── Centralized error handler ─────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    await connectDB();

    const server = app.listen(config.port, () => {
      logger.info(
        { port: config.port, env: config.nodeEnv },
        'ReachInbox API server started',
      );
    });

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');
      server.close(async () => {
        await disconnectDB();
        logger.info('Server shut down gracefully');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export { app }; // For tests
