import { FastifyInstance } from 'fastify';

export async function healthRouter(server: FastifyInstance) {
  server.get('/health', async (request, reply) => {
    return { status: 'healthy', version: '1.0.0' };
  });
}
