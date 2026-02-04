import WebSocket from 'ws';
import EventEmitter from 'events';
import { verifySignature } from './utils/signature';
import { exponentialBackoff } from './utils/retry';
import crypto from 'crypto';
import type {
  WebhookRelayOptions,
  WebhookEvent,
  ConnectedEvent,
  DisconnectedEvent,
  ReconnectingEvent,
  Logger
} from './types';

export class WebhookRelay extends EventEmitter {
  private options: Required<WebhookRelayOptions>;
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private reconnectAttempt: number = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastPongTime: number = 0;
  private webhookUrl: string | null = null;
  private sessionId: string | null = null;
  private shouldReconnect: boolean = true;
  
  constructor(options: WebhookRelayOptions) {
    super();
    
    // Set defaults
    this.options = {
      relayUrl: options.relayUrl,
      apiKey: options.apiKey,
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      httpEndpoint: options.httpEndpoint ?? '',
      logger: options.logger ?? this.createDefaultLogger()
    };
    
    // Validate options
    if (!this.options.relayUrl) {
      throw new Error('relayUrl is required');
    }
    if (!this.options.apiKey) {
      throw new Error('apiKey is required');
    }
  }
  
  /**
   * Connect to relay server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.options.logger.info('Connecting to relay...', {
          url: this.options.relayUrl
        });
        
        // Create WebSocket connection
        this.ws = new WebSocket(this.options.relayUrl);
        
        this.ws.on('open', () => {
          this.options.logger.debug('WebSocket connected');
          
          // Send authentication message
          this.send({
            type: 'auth',
            relay_id: this.extractRelayId(),
            api_key: this.options.apiKey,
            version: '1.0.0'
          });
        });
        
        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data, resolve, reject);
        });
        
        this.ws.on('close', (code, reason) => {
          this.handleClose(code, reason.toString());
        });
        
        this.ws.on('error', (error) => {
          this.options.logger.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });
        
      } catch (error) {
        this.options.logger.error('Connection failed:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Disconnect from relay server
   */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connected = false;
    this.options.logger.info('Disconnected from relay');
  }
  
  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Buffer, resolve?: Function, reject?: Function) {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'auth_success':
          this.handleAuthSuccess(message, resolve);
          break;
          
        case 'auth_error':
          this.handleAuthError(message, reject);
          break;
          
        case 'webhook':
          this.handleWebhook(message);
          break;
          
        case 'ping':
          this.handlePing(message);
          break;
          
        case 'error':
          this.handleError(message);
          break;
          
        case 'disconnect':
          this.handleDisconnect(message);
          break;
          
        default:
          this.options.logger.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      this.options.logger.error('Failed to parse message:', error);
      this.emit('error', error);
    }
  }
  
  /**
   * Handle successful authentication
   */
  private handleAuthSuccess(message: any, resolve?: Function) {
    this.connected = true;
    this.reconnectAttempt = 0;
    this.webhookUrl = message.webhook_url;
    this.sessionId = message.session_id;
    
    this.options.logger.info('Authentication successful', {
      sessionId: this.sessionId
    });
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Emit connected event
    const event: ConnectedEvent = {
      webhookUrl: this.webhookUrl!,
      sessionId: this.sessionId!,
      timestamp: message.timestamp
    };
    this.emit('connected', event);
    
    if (resolve) resolve();
  }
  
  /**
   * Handle authentication error
   */
  private handleAuthError(message: any, reject?: Function) {
    const error = new Error(message.message || 'Authentication failed');
    this.options.logger.error('Authentication failed:', message);
    this.emit('error', error);
    if (reject) reject(error);
  }
  
  /**
   * Handle incoming webhook event
   */
  private async handleWebhook(message: WebhookEvent) {
    this.options.logger.debug('Received webhook:', {
      id: message.id,
      event: message.payload.event
    });
    
    try {
      // Emit webhook event to user handler
      const listeners = this.listeners('webhook');
      
      if (listeners.length === 0) {
        this.options.logger.warn('No webhook handler registered');
        this.acknowledge(message.id);
        return;
      }
      
      // Call handler(s)
      let shouldAck = true;
      for (const handler of listeners) {
        // @ts-ignore
        const result = await handler(message);
        if (result === false) {
          shouldAck = false;
        }
      }
      
      // Auto-acknowledge unless handler returned false
      if (shouldAck) {
        this.acknowledge(message.id);
      }
      
    } catch (error) {
      this.options.logger.error('Webhook handler error:', error);
      this.emit('error', error);
      // Don't acknowledge on error (will retry)
    }
  }
  
  /**
   * Handle ping (heartbeat)
   */
  private handlePing(message: any) {
    this.lastPongTime = Date.now();
    
    // Respond with pong
    this.send({
      type: 'pong',
      timestamp: Date.now()
    });
  }
  
  /**
   * Handle error message from server
   */
  private handleError(message: any) {
    const error = new Error(message.message || 'Server error');
    this.options.logger.error('Server error:', message);
    this.emit('error', error);
  }
  
  /**
   * Handle graceful disconnect from server
   */
  private handleDisconnect(message: DisconnectedEvent) {
    this.options.logger.warn('Server requested disconnect:', message);
    this.emit('disconnected', message);
    
    if (message.reconnectAfterMs && this.options.autoReconnect) {
      setTimeout(() => this.reconnect(), message.reconnectAfterMs);
    }
  }
  
  /**
   * Handle WebSocket close
   */
  private handleClose(code: number, reason: string) {
    this.connected = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    this.options.logger.info('Connection closed', { code, reason });
    
    const event: DisconnectedEvent = {
      reason: reason || 'connection_closed',
      message: `WebSocket closed with code ${code}`
    };
    this.emit('disconnected', event);
    
    // Auto-reconnect if enabled
    if (this.shouldReconnect && this.options.autoReconnect) {
      this.reconnect();
    }
  }
  
  /**
   * Reconnect with exponential backoff
   */
  private async reconnect() {
    if (this.reconnectAttempt >= this.options.maxReconnectAttempts) {
      this.options.logger.error('Max reconnect attempts reached');
      this.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }
    
    this.reconnectAttempt++;
    const delay = exponentialBackoff(this.reconnectAttempt, this.options.reconnectDelay);
    
    this.options.logger.info(`Reconnecting in ${delay}ms...`, {
      attempt: this.reconnectAttempt,
      maxAttempts: this.options.maxReconnectAttempts
    });
    
    const event: ReconnectingEvent = {
      attempt: this.reconnectAttempt,
      maxAttempts: this.options.maxReconnectAttempts,
      nextRetryMs: delay
    };
    this.emit('reconnecting', event);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      await this.connect();
    } catch (error) {
      this.options.logger.error('Reconnect failed:', error);
      // Will retry via handleClose
    }
  }
  
  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat() {
    this.lastPongTime = Date.now();
    
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastPong = now - this.lastPongTime;
      const timeout = this.options.heartbeatInterval * 3; // 3x heartbeat interval
      
      if (timeSinceLastPong > timeout) {
        this.options.logger.warn('Heartbeat timeout, reconnecting...');
        this.ws?.close();
      }
    }, this.options.heartbeatInterval);
  }
  
  /**
   * Send acknowledgment for webhook event
   */
  private acknowledge(eventId: string) {
    this.send({
      type: 'ack',
      id: eventId,
      timestamp: Date.now()
    });
  }
  
  /**
   * Send message to server
   */
  private send(message: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.logger.warn('Cannot send message: WebSocket not connected');
      return;
    }
    
    this.ws.send(JSON.stringify(message));
  }
  
  /**
   * Extract relay ID from API key
   * (In practice, this would be provided separately or retrieved from relay)
   */
  private extractRelayId(): string {
    // For now, return empty string (will be provided during registration)
    // In production, relay_id should be stored and provided separately
    return '';
  }
  
  /**
   * Handle HTTP webhook (fallback mode)
   */
  handleHttpWebhook(payload: any, headers: any): boolean {
    const signature = headers['x-relay-signature'];
    const timestamp = headers['x-relay-timestamp'];
    
    if (!verifySignature(payload, timestamp, signature, this.options.apiKey)) {
      this.options.logger.warn('Invalid HTTP webhook signature');
      return false;
    }
    
    // Emit webhook event
    const event: WebhookEvent = {
      id: payload.id || crypto.randomUUID(),
      timestamp: parseInt(timestamp),
      signature,
      payload: payload.payload
    };
    
    this.emit('webhook', event);
    return true;
  }
  
  /**
   * Create default logger
   */
  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.info(`[INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || '')
    };
  }
}
