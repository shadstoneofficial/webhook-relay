"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRouter = webhookRouter;
const crypto_1 = __importDefault(require("crypto"));
const signature_1 = require("../services/signature");
const replay_1 = require("../services/replay");
const ratelimit_1 = require("../services/ratelimit");
const logger_1 = require("../utils/logger");
async function webhookRouter(server, opts) {
    const wsManager = opts.wsManager;
    server.post('/webhook/:relay_id', async (request, reply) => {
        const { relay_id } = request.params;
        const signature = request.headers['x-powerlobster-signature'];
        const timestamp = request.headers['x-powerlobster-timestamp'];
        try {
            // 1. Verify HMAC signature
            if (!signature || !timestamp) {
                return reply.code(401).send({
                    error: 'unauthorized',
                    message: 'Missing signature or timestamp headers'
                });
            }
            const isValidSignature = (0, signature_1.verifySignature)(request.body, timestamp, signature, process.env.WEBHOOK_SECRET);
            if (!isValidSignature) {
                logger_1.logger.warn(`Invalid signature for relay ${relay_id}`);
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
            const event = request.body;
            const eventId = event.event_id || crypto_1.default.randomUUID();
            await (0, replay_1.preventReplay)(eventId);
            // 4. Rate limiting
            const rateLimitInfo = await (0, ratelimit_1.checkRateLimit)(relay_id);
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
            }
            else {
                return reply.code(202).send({
                    status: 'queued',
                    relay_id,
                    message: 'Agent offline; event queued for delivery',
                    timestamp: Date.now()
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Webhook delivery error:', error);
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
