import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import isEmail from 'validator/lib/isEmail';
import { requireAuth } from '../middleware/auth';
import { Errors } from '../middleware/errorHandler';
import logger from '../../lib/logger';

const router = Router();

// Keep file in memory — max 5MB for CSV files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];
    const ext = file.originalname.toLowerCase();
    if (allowed.includes(file.mimetype) || ext.endsWith('.csv') || ext.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and text files are allowed'));
    }
  },
});

/**
 * POST /api/upload/csv
 * Parses an uploaded CSV or plain-text file and extracts valid email addresses.
 *
 * Accepts:
 *   - CSV files with an "email" column (or first column is treated as email)
 *   - Plain text files with one email per line
 *   - Comma-separated emails in any column
 *
 * Returns:
 *   - Total rows processed
 *   - Valid email count
 *   - Invalid count
 *   - Deduplicated list of valid emails
 */
router.post(
  '/csv',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw Errors.badRequest('No file uploaded. Send a file in the "file" field.');
      }

      const fileContent = req.file.buffer.toString('utf-8').trim();

      if (!fileContent) {
        throw Errors.badRequest('The uploaded file is empty.');
      }

      const allEmails: string[] = [];

      // Strategy: extract all email-looking strings from the entire file content.
      // This handles:
      //   - CSV with header
      //   - CSV without header
      //   - Plain text, one per line
      //   - Comma-separated on one line
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const matches = fileContent.match(emailRegex);

      if (matches) {
        allEmails.push(...matches);
      }

      if (allEmails.length === 0) {
        throw Errors.badRequest(
          'No email addresses found in the file. Make sure the file contains valid email addresses.',
        );
      }

      // Validate and deduplicate
      const seen = new Set<string>();
      const validEmails: string[] = [];
      let invalidCount = 0;

      for (const raw of allEmails) {
        const email = raw.toLowerCase().trim();
        if (isEmail(email)) {
          if (!seen.has(email)) {
            seen.add(email);
            validEmails.push(email);
          }
        } else {
          invalidCount++;
        }
      }

      logger.info(
        {
          userId: req.user!.id,
          total: allEmails.length,
          valid: validEmails.length,
          invalid: invalidCount,
          duplicates: allEmails.length - validEmails.length - invalidCount,
        },
        'CSV upload processed',
      );

      res.json({
        success: true,
        data: {
          emails: validEmails,
          total: allEmails.length,
          valid: validEmails.length,
          invalid: invalidCount,
          duplicates: allEmails.length - validEmails.length - invalidCount,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
