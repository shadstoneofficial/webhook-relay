import { redis } from '../redis/client';

const DEDUP_TTL = 10 * 60; // 10 minutes

export class ReplayError extends Error {
  name = 'ReplayError';
}

export async function preventReplay(eventId: string): Promise<void> {
  const key = `event:processed:${eventId}`;
  
  // Check if already processed
  const exists = await redis.exists(key);
  if (exists) {
    throw new ReplayError('Event already processed');
  }
  
  // Mark as processed (with expiry)
  await redis.setex(key, DEDUP_TTL, '1');
}
