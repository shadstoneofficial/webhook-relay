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
  lastDbUpdate: number;
}

export class WebSocketManager {
  private connections: Map<string, AgentConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout;
  
  constructor() {
    // Start heartbeat loop (every 30s)
    this.heartbeatInterval = setInterval(() => this.sendHeartbeats(), 30000);
  }
  
  private async logRelayEvent(relayId: string, level: string, event: string, message: string, data?: any) {
    try {
      // @ts-ignore
      await db.relay_logs.create({
        data: {
          relay_id: relayId,
          level,
          event,
          message,
          data: data || {}
        }
      });
    } catch (err) {
      logger.error(err, 'Failed to write to relay_logs');
    }
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
          const apiKey = message.api_key || message.relay_api_key;
          if (!apiKey) {
             return this.sendError(connection, 'invalid_request', 'Missing api_key or relay_api_key');
          }

          const agent = await getAgentByRelayId(message.relay_id);
          if (!agent || !await verifyApiKey(apiKey, agent.api_key_hash)) {
            return this.sendError(connection, 'invalid_credentials', 'Invalid relay_id or API key');
          }
          
          // Authentication successful
          authenticated = true;
          relayId = message.relay_id;

          // Check for key mismatch (Using a key for ID A, but ID A has no events, while ID B has events?)
          // Difficult to know "ID B" without a lookup table.
          // BUT, we can check if the API key provided is valid for ANY other agent.
          // Actually, `verifyApiKey` checks if the key matches the hash for `message.relay_id`.
          // If they provided `relay_id` A, and the key works, then they ARE agent A.
          // The problem is they "should" be agent B.
          
          // Heuristic: If this IP address has connected as a DIFFERENT agent recently, warn them?
          // Too complex for now.
          
          const sessionId = crypto.randomUUID();
          
          // Store connection
          if (relayId) {
            this.connections.set(relayId, {
              relayId,
              socket: connection,
              sessionId,
              connectedAt: Date.now(),
              lastPing: Date.now(),
              lastDbUpdate: Date.now()
            });

            // Update last_seen_at in DB
            await db.agents.update({
              where: { relay_id: relayId },
              data: { last_seen_at: new Date() }
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
          if (relayId) {
            this.logRelayEvent(relayId, 'info', 'connected', 'Agent connected successfully', { sessionId, ip: (request.raw as any).socket.remoteAddress });
            
            // Check for stale events on OTHER relay_ids for this same API key (heuristic)
            // Or simply warn them if they have 0 events but are connecting?
            // Let's add a "queue_status" to the auth_success message
            const pendingCount = await db.webhook_events.count({
              where: { relay_id: relayId, status: 'queued' }
            });
            
            if (pendingCount > 0) {
               connection.send(JSON.stringify({
                 type: 'info',
                 message: `You have ${pendingCount} pending events. Send {"type": "get_queued"} to retrieve them.`
               }));
            }
          }
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

          case 'get_queued':
            await this.handleGetQueued(relayId!);
            break;
            
          default:
            this.logRelayEvent(relayId!, 'warn', 'unknown_message', `Unknown message type received: ${message.type}`, { payload: message });
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
        this.logRelayEvent(relayId, 'info', 'disconnected', 'Agent disconnected');
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
          // @ts-ignore
          signature: event.signature,
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

  private async handleGetQueued(relayId: string) {
    const connection = this.connections.get(relayId);
    if (!connection) return;

    try {
        const events = await db.webhook_events.findMany({
            where: {
                relay_id: relayId,
                status: 'queued'
            },
            orderBy: {
                created_at: 'asc'
            },
            take: 50
        });

        logger.info(`Sending ${events.length} queued events to ${relayId}`);
        this.logRelayEvent(relayId, 'info', 'get_queued', `Processing get_queued request`, { count: events.length });

        for (const event of events) {
            connection.socket.send(JSON.stringify({
                type: 'webhook',
                id: event.id,
                timestamp: event.created_at?.getTime() || Date.now(),
                // @ts-ignore
                signature: event.signature,
                payload: event.payload
            }));

            // Store pending ack
            await redis.setex(
                `ack:pending:${event.id}`,
                30,
                JSON.stringify({ relayId, sentAt: Date.now() })
            );

            // Rate limit: 100ms delay between events to prevent flooding the client
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        logger.error(error, 'Failed to fetch/send queued events');
        this.sendError(connection.socket, 'internal_error', 'Failed to fetch queued events');
    }
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
  
  private async handlePong(relayId: string) {
    const conn = this.connections.get(relayId);
    if (conn) {
      conn.lastPing = Date.now();
      
      // Update DB every 5 minutes
      const now = Date.now();
      if (now - conn.lastDbUpdate > 300000) { // 5 mins
        conn.lastDbUpdate = now;
        
        // Refresh session expiry
        redis.expire(`session:${relayId}`, 86400).catch(err => logger.error(err, 'Failed to refresh session expiry'));

        db.agents.update({
          where: { relay_id: relayId },
          data: { last_seen_at: new Date() }
        }).catch(err => logger.error(err, 'Failed to update last_seen_at'));
      }
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
