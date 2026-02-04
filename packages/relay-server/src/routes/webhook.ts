import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { verifySignature } from '../services/signature';
import { preventReplay } from '../services/replay';
import { checkRateLimit } from '../services/ratelimit';
import { WebSocketManager } from '../websocket/manager';
import { logger } from '../utils/logger';

export async function webhookRouter(server: FastifyInstance, opts: any) {
  const wsManager: WebSocketManager = opts.wsManager;

  server.post('/webhook/:relay_id', async (request, reply) => {
    const { relay_id } = request.params as { relay_id: string };
    const signature = request.headers['x-powerlobster-signature'] as string;
    const timestamp = request.headers['x-powerlobster-timestamp'] as string;
    
    try {
      // 1. Verify HMAC signature
      if (!signature || !timestamp) {
        return reply.code(401).send({
          error: 'unauthorized',
          message: 'Missing signature or timestamp headers'
        });
      }
      
      const isValidSignature = verifySignature(
        request.body,
        timestamp,
        signature,
        process.env.WEBHOOK_SECRET!
      );
      
      if (!isValidSignature) {
        logger.warn(`Invalid signature for relay ${relay_id}`);
        return reply.code(401).send({
          error: 'unauthorized',
          message: 'Invalid signature'
        });
      }
      
      // 2. Check timestamp (prevent replay attacks)
      const eventTime = parseInt(timestamp);
      const now = Date.now();
      const MAX_AGE = 5 * 60 * 1000; // 5 minutes
      
      if (Math.abs(now - eventTime) > MAX_AGE) {
        return reply.code(401).send({
          error: 'unauthorized',
          message: 'Timestamp too old or in future'
        });
      }
      
      // 3. Prevent replay attacks (event deduplication)
      const event = request.body as any;
      const eventId = event.event_id || crypto.randomUUID();
      
      await preventReplay(eventId);
      
      // 4. Rate limiting
      const rateLimitInfo = await checkRateLimit(relay_id);
      reply.header('X-RateLimit-Limit', rateLimitInfo.limit);
      reply.header('X-RateLimit-Remaining', rateLimitInfo.remaining);
      reply.header('X-RateLimit-Reset', rateLimitInfo.reset);
      
      // 5. Forward to agent via WebSocket
      const result = await wsManager.sendWebhook(relay_id, {
        id: eventId,
        signature,
        payload: event
      });
      
      // 6. Return response
      if (result.status === 'delivered') {
        return reply.code(200).send({
          status: 'delivered',
          relay_id,
          timestamp: Date.now()
        });
      } else {
        return reply.code(202).send({
          status: 'queued',
          relay_id,
          message: 'Agent offline; event queued for delivery',
          timestamp: Date.now()
        });
      }
      
    } catch (error: any) {
      logger.error('Webhook delivery error:', error);
      
      if (error.name === 'RateLimitError') {
        return reply.code(429).send({
          error: 'rate_limit_exceeded',
          message: error.message,
          retry_after_ms: error.retryAfter
        });
      }
      
      if (error.name === 'ReplayError') {
        return reply.code(409).send({
          error: 'duplicate_event',
          message: 'Event already processed'
        });
      }
      
      return reply.code(500).send({
        error: 'internal_error',
        message: 'Failed to process webhook'
      });
    }
  });
}
