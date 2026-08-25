import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAndIncrementRateLimit, msUntilNextHourWindow } from '../../lib/rateLimiter';
import type Redis from 'ioredis';

// Mock Redis eval to simulate the Lua script behavior
function createMockRedis(evalResult: number): Partial<Redis> {
  return {
    eval: vi.fn().mockResolvedValue(evalResult),
    get: vi.fn().mockResolvedValue('5'),
  };
}

describe('Rate Limiter', () => {
  describe('checkAndIncrementRateLimit', () => {
    it('returns true when under the limit', async () => {
      const mockRedis = createMockRedis(1) as Redis;
      const result = await checkAndIncrementRateLimit(mockRedis, 'user-1', 200);
      expect(result).toBe(true);
    });

    it('returns false when limit is exceeded (eval returns 0)', async () => {
      const mockRedis = createMockRedis(0) as Redis;
      const result = await checkAndIncrementRateLimit(mockRedis, 'user-1', 200);
      expect(result).toBe(false);
    });

    it('passes correct arguments to Redis eval', async () => {
      const evalMock = vi.fn().mockResolvedValue(1);
      const mockRedis = { eval: evalMock } as unknown as Redis;

      await checkAndIncrementRateLimit(mockRedis, 'user-123', 100);

      expect(evalMock).toHaveBeenCalledOnce();
      const args = evalMock.mock.calls[0];
      // args: [script, numKeys, key, limit, ttl]
      expect(args[1]).toBe(1); // numKeys
      expect(args[2]).toContain('rate:user-123:'); // key contains userId
      expect(args[3]).toBe('100'); // limit as string
      expect(args[4]).toBe('3600'); // ttl
    });

    it('uses different keys for different users', async () => {
      const evalMock = vi.fn().mockResolvedValue(1);
      const mockRedis = { eval: evalMock } as unknown as Redis;

      await checkAndIncrementRateLimit(mockRedis, 'user-A', 100);
      await checkAndIncrementRateLimit(mockRedis, 'user-B', 100);

      const key1 = (evalMock.mock.calls[0] as unknown[])[2] as string;
      const key2 = (evalMock.mock.calls[1] as unknown[])[2] as string;
      expect(key1).not.toBe(key2);
      expect(key1).toContain('user-A');
      expect(key2).toContain('user-B');
    });
  });

  describe('msUntilNextHourWindow', () => {
    it('returns a positive number', () => {
      const ms = msUntilNextHourWindow();
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(3_600_000);
    });

    it('returns at most 1 hour in ms', () => {
      const ms = msUntilNextHourWindow();
      expect(ms).toBeLessThanOrEqual(3_600_000);
    });
  });
});
