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
  
  // WebSocket endpoint
  const wsManager = new WebSocketManager();
  
  // Register routes
  // Pass wsManager to webhookRouter via opts
  server.register(webhookRouter, { prefix: '/api/v1', wsManager });
  server.register(registerRouter, { prefix: '/api/v1' });
  server.register(healthRouter, { prefix: '/api/v1' });
  server.register(statsRouter, { prefix: '/api/v1' });
  
  server.register(async (fastify) => {
    fastify.get('/api/v1/connect', { websocket: true }, wsManager.handleConnection.bind(wsManager));
  });
  
  return server;
}
