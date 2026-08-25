import pino from 'pino';
import { config } from '../config';

const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  transport:
    config.nodeEnv !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  // Never log sensitive fields
  redact: {
    paths: [
      'smtpPass',
      'password',
      'token',
      'secret',
      'authorization',
      'cookie',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
