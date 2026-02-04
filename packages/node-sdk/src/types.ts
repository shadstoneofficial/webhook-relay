export interface WebhookRelayOptions {
  relayUrl: string;
  apiKey: string;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  httpEndpoint?: string;
  logger?: Logger;
}

export interface WebhookEvent {
  id: string;
  timestamp: number;
  signature: string;
  payload: {
    event: string;
    workspace_id: string;
    data: any;
  };
}

export interface ConnectedEvent {
  webhookUrl: string;
  sessionId: string;
  timestamp: number;
}

export interface DisconnectedEvent {
  reason: string;
  message?: string;
  reconnectAfterMs?: number;
}

export interface ReconnectingEvent {
  attempt: number;
  maxAttempts: number;
  nextRetryMs: number;
}

export interface Logger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

export type WebhookHandler = (event: WebhookEvent) => Promise<void | boolean> | void | boolean;
export type ConnectedHandler = (event: ConnectedEvent) => void;
export type DisconnectedHandler = (event: DisconnectedEvent) => void;
export type ErrorHandler = (error: Error) => void;
export type ReconnectingHandler = (event: ReconnectingEvent) => void;
