import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import cors from '@fastify/cors';
import rawBody from 'fastify-raw-body';
import { webhookRouter } from './routes/webhook';
import { registerRouter } from './routes/register';
import { healthRouter } from './routes/health';
import { statsRouter } from './routes/stats';
import { eventsRouter } from './routes/events';
import { adminRouter } from './routes/admin';
import { WebSocketManager } from './websocket/manager';
import { errorMiddleware } from './middleware/error';
import { securityMiddleware } from './middleware/security';
import { logger } from './utils/logger';

import fs from 'fs';
import path from 'path';

export async function createServer() {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
    requestIdLogLabel: 'request_id'
  });
  
  // Register plugins
  await server.register(rawBody, {
    field: 'rawBody',
    global: false, // Only use it where needed
    encoding: 'utf8',
    runFirst: true
  });

  await server.register(cors, {
    origin: '*', // For now, allow all origins. In production, you might want to restrict this to powerlobster.com
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-powerlobster-signature', 'x-powerlobster-timestamp', 'x-admin-key']
  });
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
  server.register(eventsRouter, { prefix: '/api/v1' });
  server.register(adminRouter, { prefix: '/api/v1/admin' });
  
  // WebSocket endpoint (Moved out of async wrapper for clarity)
  server.get('/api/v1/connect', { websocket: true }, wsManager.handleConnection.bind(wsManager));
  
  // Serve admin.html
  server.get('/admin', async (request, reply) => {
    const filePath = path.join(__dirname, '../public/admin.html');
    const content = fs.readFileSync(filePath, 'utf8');
    return reply.type('text/html').send(content);
  });

  // Serve skill.md
  server.get('/skill.md', async (request, reply) => {
    const filePath = path.join(__dirname, '../public/skill.md');
    const content = fs.readFileSync(filePath, 'utf8');
    return reply.type('text/plain').send(content);
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
        <p>
          <strong>API Status:</strong> <a href="/api/v1/health">/api/v1/health</a><br>
          <strong>Agent Skills:</strong> <a href="/skill.md">/skill.md</a><br>
          <strong>Admin Dashboard:</strong> <a href="/admin">/admin</a>
        </p>
        <hr>
        <p><small>Powered by <a href="https://github.com/powerlobster-hq/webhook-relay" style="color: #6d28d9; text-decoration: none;">PowerLobster</a></small></p>
      </body>
      </html>
    `);
  });
  
  return server;
}
