"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const fastify_1 = __importDefault(require("fastify"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
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
    return server;
}
