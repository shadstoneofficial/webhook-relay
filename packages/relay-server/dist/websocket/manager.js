"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketManager = void 0;
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("../services/auth");
const logger_1 = require("../utils/logger");
const client_1 = require("../redis/client");
class WebSocketManager {
    constructor() {
        this.connections = new Map();
        // Start heartbeat loop (every 30s)
        this.heartbeatInterval = setInterval(() => this.sendHeartbeats(), 30000);
    }
    async handleConnection(conn, request) {
        const connection = conn.socket;
        let authenticated = false;
        let relayId = null;
        connection.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                // Handle authentication
                if (!authenticated) {
                    if (message.type !== 'auth') {
                        return this.sendError(connection, 'authentication_required', 'Must authenticate first');
                    }
                    // Verify credentials
                    const agent = await (0, auth_1.getAgentByRelayId)(message.relay_id);
                    if (!agent || !await (0, auth_1.verifyApiKey)(message.api_key, agent.api_key_hash)) {
                        return this.sendError(connection, 'invalid_credentials', 'Invalid relay_id or API key');
                    }
                    // Authentication successful
                    authenticated = true;
                    relayId = message.relay_id;
                    const sessionId = crypto_1.default.randomUUID();
                    // Store connection
                    if (relayId) {
                        this.connections.set(relayId, {
                            relayId,
                            socket: connection,
                            sessionId,
                            connectedAt: Date.now(),
                            lastPing: Date.now()
                        });
                    }
                    // Store session in Redis (for multi-instance routing)
                    await client_1.redis.setex(`session:${relayId}`, 86400, // 24 hours
                    JSON.stringify({ sessionId, connectedAt: Date.now() }));
                    // Send success message
                    connection.send(JSON.stringify({
                        type: 'auth_success',
                        relay_id: relayId,
                        webhook_url: `${process.env.PUBLIC_URL}/api/v1/webhook/${relayId}`,
                        session_id: sessionId,
                        timestamp: Date.now()
                    }));
                    logger_1.logger.info(`Agent connected: ${relayId}`);
                    return;
                }
                // Handle other message types
                switch (message.type) {
                    case 'pong':
                        this.handlePong(relayId);
                        break;
                    case 'ack':
                        await this.handleAck(relayId, message.id);
                        break;
                    default:
                        this.sendError(connection, 'invalid_message', `Unknown message type: ${message.type}`);
                }
            }
            catch (error) {
                logger_1.logger.error(error, 'WebSocket message error');
                this.sendError(connection, 'internal_error', 'Failed to process message');
            }
        });
        connection.on('close', () => {
            if (relayId) {
                this.connections.delete(relayId);
                client_1.redis.del(`session:${relayId}`);
                logger_1.logger.info(`Agent disconnected: ${relayId}`);
            }
        });
        connection.on('error', (error) => {
            logger_1.logger.error(error, 'WebSocket error');
        });
    }
    async sendWebhook(relayId, event) {
        const connection = this.connections.get(relayId);
        if (!connection) {
            // Agent offline - queue for retry
            await client_1.redis.lpush(`queue:pending:${relayId}`, JSON.stringify(event));
            return { status: 'queued' };
        }
        // Send event to agent
        connection.socket.send(JSON.stringify({
            type: 'webhook',
            id: event.id,
            timestamp: Date.now(),
            signature: event.signature,
            payload: event.payload
        }));
        // Store pending ack (timeout after 30s)
        await client_1.redis.setex(`ack:pending:${event.id}`, 30, JSON.stringify({ relayId, sentAt: Date.now() }));
        return { status: 'delivered' };
    }
    async handleAck(relayId, eventId) {
        // Remove from pending queue
        await client_1.redis.del(`ack:pending:${eventId}`);
        logger_1.logger.debug(`Event acknowledged: ${eventId} by ${relayId}`);
    }
    sendHeartbeats() {
        const now = Date.now();
        const TIMEOUT = 90000; // 90 seconds
        for (const [relayId, conn] of this.connections.entries()) {
            // Check if connection timed out (no pong in 90s)
            if (now - conn.lastPing > TIMEOUT) {
                logger_1.logger.warn(`Connection timeout: ${relayId}`);
                conn.socket.close();
                this.connections.delete(relayId);
                continue;
            }
            // Send ping
            conn.socket.send(JSON.stringify({
                type: 'ping',
                timestamp: now
            }));
        }
    }
    handlePong(relayId) {
        const conn = this.connections.get(relayId);
        if (conn) {
            conn.lastPing = Date.now();
        }
    }
    sendError(socket, error, message) {
        socket.send(JSON.stringify({
            type: 'error',
            error,
            message,
            timestamp: Date.now()
        }));
    }
    destroy() {
        clearInterval(this.heartbeatInterval);
        for (const conn of this.connections.values()) {
            conn.socket.close();
        }
    }
}
exports.WebSocketManager = WebSocketManager;
