import { FastifyInstance } from 'fastify';

export async function statsRouter(server: FastifyInstance) {
  server.get('/stats', async (request, reply) => {
    // TODO: Implement actual stats gathering
    return {
      agents_connected: 0,
      messages_processed: 0,
      uptime: process.uptime()
    };
  });
}
