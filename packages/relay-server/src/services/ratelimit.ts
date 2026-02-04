import { redis } from '../redis/client';

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute

export class RateLimitError extends Error {
  name = 'RateLimitError';
  retryAfter: number;
  
  constructor(message: string, retryAfter: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

export async function checkRateLimit(relayId: string) {
  const key = `ratelimit:${relayId}`;
  
  // Increment counter
  const count = await redis.incr(key);
  
  // Set expiry on first request
  if (count === 1) {
    await redis.pexpire(key, RATE_LIMIT_WINDOW);
  }
  
  // Get TTL
  const ttl = await redis.pttl(key);
  
  // Check limit
  if (count > RATE_LIMIT_MAX) {
    throw new RateLimitError(
      `Rate limit exceeded. Retry after ${ttl}ms`,
      ttl
    );
  }
  
  return {
    limit: RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - count),
    reset: Date.now() + ttl
  };
}
