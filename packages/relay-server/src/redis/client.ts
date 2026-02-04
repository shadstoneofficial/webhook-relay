import Redis from 'ioredis';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export const redis = new Redis(config.redisUrl, {
  lazyConnect: true
});

export async function connectRedis() {
  try {
    await redis.connect();
    logger.info('Connected to Redis');
  } catch (error) {
    logger.error(error, 'Failed to connect to Redis');
    throw error;
  }
}
