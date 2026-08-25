import type Redis from 'ioredis';
import logger from './logger';

/**
 * Redis-backed atomic hourly rate limiter using a Lua script.
 *
 * Key strategy: rate:{userId}:{hourEpoch}
 *   - hourEpoch = Math.floor(Date.now() / 3600000)
 *   - Key expires automatically after 1 hour
 *   - INCR is atomic â†’ safe with multiple concurrent workers
 *
 * The Lua script atomically:
 *   1. INCRements the counter
 *   2. Sets TTL on first increment (avoids race between INCR and EXPIRE)
 *   3. Returns the new count
 *
 * If count > limit â†’ the caller is responsible for rescheduling the job.
 * We DECR the counter if we decide not to send (to keep count accurate).
 */

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, ttl)
end

if current > limit then
  redis.call('DECR', key)
  return 0
else
  return current
end
`;

function getHourEpoch(): number {
  return Math.floor(Date.now() / 3_600_000);
}

function getRateLimitKey(campaignId: string): string {
  return `rate:${campaignId}:${getHourEpoch()}`;
}

/**
 * Attempts to consume one slot from the rate limit.
 *
 * @returns true if the email can be sent now, false if limit is reached
 */
export async function checkAndIncrementRateLimit(
  redis: Redis,
  campaignId: string,
  maxPerHour: number,
): Promise<boolean> {
  const key = getRateLimitKey(campaignId);
  const ttlSeconds = 3600; // 1 hour

  const result = await redis.eval(
    RATE_LIMIT_LUA,
    1,
    key,
    String(maxPerHour),
    String(ttlSeconds),
  ) as number;

  if (result === 0) {
    logger.debug({ campaignId, maxPerHour }, 'Rate limit reached');
    return false;
  }

  logger.debug({ campaignId, currentCount: result, maxPerHour }, 'Rate limit ok');
  return true;
}

/**
 * Returns the number of milliseconds until the next hour window starts.
 * Used to calculate how long to delay a rate-limited job.
 */
export function msUntilNextHourWindow(): number {
  const now = Date.now();
  const nextHour = (Math.floor(now / 3_600_000) + 1) * 3_600_000;
  return nextHour - now;
}

/**
 * Gets current usage count for a user in the current hour.
 * Used for dashboard display / debugging.
 */
export async function getCurrentHourCount(
  redis: Redis,
  campaignId: string,
): Promise<number> {
  const key = getRateLimitKey(campaignId);
  const value = await redis.get(key);
  return value ? parseInt(value, 10) : 0;
}
