"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitError = void 0;
exports.checkRateLimit = checkRateLimit;
const client_1 = require("../redis/client");
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute
class RateLimitError extends Error {
    constructor(message, retryAfter) {
        super(message);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}
exports.RateLimitError = RateLimitError;
async function checkRateLimit(relayId) {
    const key = `ratelimit:${relayId}`;
    // Increment counter
    const count = await client_1.redis.incr(key);
    // Set expiry on first request
    if (count === 1) {
        await client_1.redis.pexpire(key, RATE_LIMIT_WINDOW);
    }
    // Get TTL
    const ttl = await client_1.redis.pttl(key);
    // Check limit
    if (count > RATE_LIMIT_MAX) {
        throw new RateLimitError(`Rate limit exceeded. Retry after ${ttl}ms`, ttl);
    }
    return {
        limit: RATE_LIMIT_MAX,
        remaining: Math.max(0, RATE_LIMIT_MAX - count),
        reset: Date.now() + ttl
    };
}
