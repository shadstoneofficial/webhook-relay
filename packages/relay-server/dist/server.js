"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const fastify_1 = __importDefault(require("fastify"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const cors_1 = __importDefault(require("@fastify/cors"));
const webhook_1 = require("./routes/webhook");
const register_1 = require("./routes/register");
const health_1 = require("./routes/health");
const stats_1 = require("./routes/stats");
const manager_1 = require("./websocket/manager");
const error_1 = require("./middleware/error");
const security_1 = require("./middleware/security");
const logger_1 = require("./utils/logger");
async function createServer() {
    const server = (0, fastify_1.default)({
        logger: logger_1.logger,
        trustProxy: true,
        requestIdLogLabel: 'request_id'
    });
    // Register plugins
    await server.register(cors_1.default, {
        origin: '*', // For now, allow all origins. In production, you might want to restrict this to powerlobster.com
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-powerlobster-signature', 'x-powerlobster-timestamp', 'x-admin-key']
    });
    await server.register(websocket_1.default);
    // Apply middleware
    server.addHook('onRequest', security_1.securityMiddleware);
    server.setErrorHandler(error_1.errorMiddleware);
    // WebSocket endpoint
    const wsManager = new manager_1.WebSocketManager();
    // Register routes
    // Pass wsManager to webhookRouter via opts
    server.register(webhook_1.webhookRouter, { prefix: '/api/v1', wsManager });
    server.register(register_1.registerRouter, { prefix: '/api/v1' });
    server.register(health_1.healthRouter, { prefix: '/api/v1' });
    server.register(stats_1.statsRouter, { prefix: '/api/v1' });
    server.register(async (fastify) => {
        fastify.get('/api/v1/connect', { websocket: true }, wsManager.handleConnection.bind(wsManager));
    });
    // Root route
    server.get('/', async (request, reply) => {
        return reply.type('text/html').send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PowerLobster Relay</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; }
          h1 { color: #6d28d9; }
          code { background: #f3f4f6; padding: 2px 5px; border-radius: 4px; }
          .status { display: inline-block; padding: 5px 10px; background: #dcfce7; color: #166534; border-radius: 9999px; font-weight: 500; font-size: 0.875rem; }
        </style>
      </head>
      <body>
        <h1>🦞 PowerLobster Relay</h1>
        <p><span class="status">System Operational</span></p>
        <p>This is the high-performance webhook relay server for PowerLobster.</p>
        <p>If you are looking for the API status, check: <br><code>GET /api/v1/health</code></p>
        <hr>
        <p><small>Powered by <a href="https://github.com/powerlobster-hq/webhook-relay" style="color: #6d28d9; text-decoration: none;">PowerLobster</a></small></p>
      </body>
      </html>
    `);
    });
    return server;
}
