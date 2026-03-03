import { SocketStream } from '@fastify/websocket';
import { WebSocket } from 'ws';
import { FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { verifyApiKey, getAgentByRelayId } from '../services/auth';
import { logger } from '../utils/logger';
import { redis } from '../redis/client';
import { db } from '../database/client';

interface AgentConnection {
  relayId: string;
  socket: WebSocket;
  sessionId: string;
  connectedAt: number;
  lastPing: number;
}

export class WebSocketManager {
  private connections: Map<string, AgentConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout;
  
  constructor() {
    // Start heartbeat loop (every 30s)
    this.heartbeatInterval = setInterval(() => this.sendHeartbeats(), 30000);
  }
  
  async handleConnection(conn: SocketStream, request: FastifyRequest) {
    const connection = conn.socket;
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
          
          if (!message.relay_id) {
            return this.sendError(connection, 'invalid_request', 'Missing relay_id');
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
        logger.error(error, 'WebSocket message error');
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
    
    connection.on('error', (error: Error) => {
      logger.error(error, 'WebSocket error');
    });
  }
  
  async sendWebhook(relayId: string, event: any) {
    const connection = this.connections.get(relayId);
    
    // 1. Persist to Database (Always)
    try {
      await db.webhook_events.create({
        data: {
          id: event.id, // Internal UUID
          event_id: event.id, // Using internal UUID as event_id for now, or use event.payload.id if available
          relay_id: relayId,
          payload: event.payload,
          status: 'queued',
          created_at: new Date(event.timestamp || Date.now())
        }
      });
    } catch (dbError) {
      logger.error(dbError, 'Failed to persist webhook event to DB');
      // Continue to try delivering even if DB write fails (best effort)
    }

    if (!connection) {
      // Agent offline - queue for retry (Redis is secondary/legacy queue now)
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
    
    // Optimistically update status (or wait for ack? Let's keep it 'queued' until acked, or 'delivered' if sent?)
    // The previous logic returned 'delivered' immediately upon sending.
    // Ideally we should update to 'delivered' only on ACK.
    // For now, to match existing contract:
    return { status: 'delivered' };
  }
  
  private async handleAck(relayId: string, eventId: string) {
    // Remove from pending queue
    await redis.del(`ack:pending:${eventId}`);
    
    // Update DB status to delivered
    try {
      await db.webhook_events.updateMany({
        where: {
          id: eventId,
          relay_id: relayId
        },
        data: {
          status: 'delivered',
          delivered_at: new Date()
        }
      });
    } catch (dbError) {
      logger.error(dbError, 'Failed to update event status to delivered');
    }

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
