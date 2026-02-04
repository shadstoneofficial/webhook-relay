import { FastifyRequest, FastifyReply } from 'fastify';

export async function securityMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Add security headers
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
}
