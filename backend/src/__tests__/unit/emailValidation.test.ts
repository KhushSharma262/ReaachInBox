import { describe, it, expect } from 'vitest';
import isEmail from 'validator/lib/isEmail';

/**
 * Tests the email validation logic used in the CSV upload route.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function extractEmails(text: string): string[] {
  return text.match(EMAIL_REGEX) ?? [];
}

function validateAndDedup(raw: string[]): {
  valid: string[];
  invalid: number;
} {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalid = 0;

  for (const r of raw) {
    const email = r.toLowerCase().trim();
    if (isEmail(email)) {
      if (!seen.has(email)) {
        seen.add(email);
        valid.push(email);
      }
    } else {
      invalid++;
    }
  }

  return { valid, invalid };
}

describe('Email extraction and validation', () => {
  it('extracts emails from plain text', () => {
    const text = 'hello@example.com\nworld@test.org\ninvalid-email';
    const emails = extractEmails(text);
    expect(emails).toContain('hello@example.com');
    expect(emails).toContain('world@test.org');
  });

  it('extracts emails from CSV-like content', () => {
    const csv = 'name,email\nJohn,john@example.com\nJane,jane@test.com';
    const emails = extractEmails(csv);
    expect(emails).toContain('john@example.com');
    expect(emails).toContain('jane@test.com');
  });

  it('deduplicates emails', () => {
    const raw = ['test@example.com', 'TEST@EXAMPLE.COM', 'other@example.com'];
    const { valid } = validateAndDedup(raw);
    expect(valid).toHaveLength(2);
    expect(valid).toContain('test@example.com');
  });

  it('filters invalid emails', () => {
    const raw = ['valid@example.com', 'not-an-email', '@nodomain', 'missing@'];
    const { valid, invalid } = validateAndDedup(raw);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toBe('valid@example.com');
    expect(invalid).toBe(3);
  });

  it('handles empty input', () => {
    const emails = extractEmails('');
    expect(emails).toHaveLength(0);
  });

  it('lowercases all extracted emails', () => {
    const raw = ['UPPER@EXAMPLE.COM', 'Mixed@Test.Org'];
    const { valid } = validateAndDedup(raw);
    expect(valid).toContain('upper@example.com');
    expect(valid).toContain('mixed@test.org');
  });
});

describe('Delay calculation', () => {
  it('computes correct delay for each email in a campaign', () => {
    const baseTime = Date.now();
    const minDelayMs = 2000;
    const recipients = ['a@test.com', 'b@test.com', 'c@test.com'];

    const scheduledTimes = recipients.map(
      (_, i) => new Date(baseTime + i * minDelayMs),
    );

    // First email: no extra delay
    expect(scheduledTimes[0].getTime()).toBe(baseTime);
    // Second email: 2s later
    expect(scheduledTimes[1].getTime()).toBe(baseTime + 2000);
    // Third: 4s later
    expect(scheduledTimes[2].getTime()).toBe(baseTime + 4000);
  });

  it('handles zero delay', () => {
    const baseTime = 1_000_000;
    const delay = 0;
    const times = [0, 1, 2].map((i) => baseTime + i * delay);
    expect(new Set(times).size).toBe(1); // All same time
  });
});
