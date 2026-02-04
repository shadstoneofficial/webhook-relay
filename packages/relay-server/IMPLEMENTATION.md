# Relay Server Implementation Guide

Reference implementation pseudocode for core components.

---

## Entry Point (`src/index.ts`)

```typescript
import { createServer } from './server';
import { connectDatabase } from './database/client';
import { connectRedis } from './redis/client';
import { logger } from './utils/logger';
import { config } from './config/env';

async function main() {
  try {
    // Connect to dependencies
    await connectDatabase();
    await connectRedis();
    
    // Start server
    const server = await createServer();
    await server.listen({ port: config.port, host: '0.0.0.0' });
    
    logger.info(`🦞 Relay server started on port ${config.port}`);
    
    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await server.close();
      process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
```

---

## Server Setup (`src/server.ts`)

```typescript
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { webhookRouter } from './routes/webhook';
import { registerRouter } from './routes/register';
import { healthRouter } from './routes/health';
import { statsRouter } from './routes/stats';
import { WebSocketManager } from './websocket/manager';
import { errorMiddleware } from './middleware/error';
import { securityMiddleware } from './middleware/security';
import { logger } from './utils/logger';

export async function createServer() {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
    requestIdLogLabel: 'request_id'
  });
  
  // Register plugins
  await server.register(fastifyWebsocket);
  
  // Apply middleware
  server.addHook('onRequest', securityMiddleware);
  server.setErrorHandler(errorMiddleware);
  
  // Register routes
  server.register(webhookRouter, { prefix: '/api/v1' });
  server.register(registerRouter, { prefix: '/api/v1' });
  server.register(healthRouter, { prefix: '/api/v1' });
  server.register(statsRouter, { prefix: '/api/v1' });
  
  // WebSocket endpoint
  const wsManager = new WebSocketManager();
  server.register(async (fastify) => {
    fastify.get('/api/v1/connect', { websocket: true }, wsManager.handleConnection);
  });
  
  return server;
}
```

---

## WebSocket Manager (`src/websocket/manager.ts`)

```typescript
import { WebSocket } from 'ws';
import { verifyApiKey, getAgentByRelayId } from '../services/auth';
import { logger } from '../utils/logger';
import { redis } from '../redis/client';

interface AgentConnection {
  relayId: string;
  socket: WebSocket;
  sessionId: string;
  connectedAt: number;
  lastPing: number;
}

export class WebSocketManager {
  private connections: Map<string, AgentConnection> = new Map();
  private heartbeatInterval: NodeJS.Timer;
  
  constructor() {
    // Start heartbeat loop (every 30s)
    this.heartbeatInterval = setInterval(() => this.sendHeartbeats(), 30000);
  }
  
  async handleConnection(connection: WebSocket, request: any) {
    let authenticated = false;
    let relayId: string | null = null;
    
    connection.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle authentication
        if (!authenticated) {
          if (message.type !== 'auth') {
            return this.sendError(connection, 'authentication_required', 'Must authenticate first');
          }
          
          // Verify credentials
          const agent = await getAgentByRelayId(message.relay_id);
          if (!agent || !await verifyApiKey(message.api_key, agent.api_key_hash)) {
            return this.sendError(connection, 'invalid_credentials', 'Invalid relay_id or API key');
          }
          
          // Authentication successful
          authenticated = true;
          relayId = message.relay_id;
          const sessionId = crypto.randomUUID();
          
          // Store connection
          this.connections.set(relayId, {
            relayId,
            socket: connection,
            sessionId,
            connectedAt: Date.now(),
            lastPing: Date.now()
          });
          
          // Store session in Redis (for multi-instance routing)
          await redis.setex(
            `session:${relayId}`,
            86400, // 24 hours
            JSON.stringify({ sessionId, connectedAt: Date.now() })
          );
          
          // Send success message
          connection.send(JSON.stringify({
            type: 'auth_success',
            relay_id: relayId,
            webhook_url: `${process.env.PUBLIC_URL}/api/v1/webhook/${relayId}`,
            session_id: sessionId,
            timestamp: Date.now()
          }));
          
          logger.info(`Agent connected: ${relayId}`);
          return;
        }
        
        // Handle other message types
        switch (message.type) {
          case 'pong':
            this.handlePong(relayId!);
            break;
            
          case 'ack':
            await this.handleAck(relayId!, message.id);
            break;
            
          default:
            this.sendError(connection, 'invalid_message', `Unknown message type: ${message.type}`);
        }
        
      } catch (error) {
        logger.error('WebSocket message error:', error);
        this.sendError(connection, 'internal_error', 'Failed to process message');
      }
    });
    
    connection.on('close', () => {
      if (relayId) {
        this.connections.delete(relayId);
        redis.del(`session:${relayId}`);
        logger.info(`Agent disconnected: ${relayId}`);
      }
    });
    
    connection.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });
  }
  
  async sendWebhook(relayId: string, event: any) {
    const connection = this.connections.get(relayId);
    
    if (!connection) {
      // Agent offline - queue for retry
      await redis.lpush(`queue:pending:${relayId}`, JSON.stringify(event));
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
    await redis.setex(
      `ack:pending:${event.id}`,
      30,
      JSON.stringify({ relayId, sentAt: Date.now() })
    );
    
    return { status: 'delivered' };
  }
  
  private async handleAck(relayId: string, eventId: string) {
    // Remove from pending queue
    await redis.del(`ack:pending:${eventId}`);
    logger.debug(`Event acknowledged: ${eventId} by ${relayId}`);
  }
  
  private sendHeartbeats() {
    const now = Date.now();
    const TIMEOUT = 90000; // 90 seconds
    
    for (const [relayId, conn] of this.connections.entries()) {
      // Check if connection timed out (no pong in 90s)
      if (now - conn.lastPing > TIMEOUT) {
        logger.warn(`Connection timeout: ${relayId}`);
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
  
  private handlePong(relayId: string) {
    const conn = this.connections.get(relayId);
    if (conn) {
      conn.lastPing = Date.now();
    }
  }
  
  private sendError(socket: WebSocket, error: string, message: string) {
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
```

---

## Webhook Route (`src/routes/webhook.ts`)

```typescript
import { FastifyInstance } from 'fastify';
import { verifySignature } from '../services/signature';
import { preventReplay } from '../services/replay';
import { checkRateLimit } from '../services/ratelimit';
import { wsManager } from '../websocket/manager';
import { logger } from '../utils/logger';

export async function webhookRouter(server: FastifyInstance) {
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
```

---

## Signature Verification (`src/services/signature.ts`)

```typescript
import crypto from 'crypto';

export function verifySignature(
  payload: any,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  // Construct signed payload (timestamp + body)
  const body = JSON.stringify(payload);
  const signedPayload = `${timestamp}.${body}`;
  
  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  
  // Extract received signature (remove "sha256=" prefix)
  const receivedSignature = signature.replace('sha256=', '');
  
  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );
  } catch {
    return false;
  }
}
```

---

## Replay Prevention (`src/services/replay.ts`)

```typescript
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
```

---

## Rate Limiting (`src/services/ratelimit.ts`)

```typescript
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
```

---

## Encryption Service (`src/services/encryption.ts`)

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export function encryptEndpoint(endpoint: string, key: string): string {
  const keyBuffer = Buffer.from(key, 'hex');
  const iv = crypto.randomBytes(12); // 12 bytes for GCM
  
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(endpoint, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Return: iv + authTag + ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptEndpoint(encryptedData: string, key: string): string {
  const keyBuffer = Buffer.from(key, 'hex');
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

---

## Authentication (`src/services/auth.ts`)

```typescript
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../database/client';

const BCRYPT_ROUNDS = 12;

export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const base64Url = randomBytes.toString('base64url').replace(/=/g, '');
  const hexSuffix = crypto.randomBytes(16).toString('hex');
  return `sk_${base64Url}_${hexSuffix}`;
}

export async function hashApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, BCRYPT_ROUNDS);
}

export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(apiKey, hash);
}

export async function getAgentByRelayId(relayId: string) {
  return db.agents.findUnique({
    where: { relay_id: relayId }
  });
}
```

---

## Database Schema (`src/database/migrations/001_initial.sql`)

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relay_id VARCHAR(64) UNIQUE NOT NULL,
  api_key_hash VARCHAR(128) NOT NULL,
  workspace_id VARCHAR(128),
  connection_type VARCHAR(16) NOT NULL DEFAULT 'websocket',
  http_endpoint_encrypted TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_agents_relay_id ON agents(relay_id);
CREATE INDEX idx_agents_workspace ON agents(workspace_id);

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relay_id VARCHAR(64) NOT NULL REFERENCES agents(relay_id),
  event_id VARCHAR(128) UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL, -- 'delivered', 'pending', 'failed'
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP
);

CREATE INDEX idx_events_relay_id ON webhook_events(relay_id);
CREATE INDEX idx_events_status ON webhook_events(status);
```

---

This pseudocode provides a solid foundation for implementing the relay server. Adjust as needed based on chosen frameworks and libraries.
