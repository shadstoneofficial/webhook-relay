import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';

export function errorMiddleware(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  logger.error(error);
  
  reply.status(error.statusCode || 500).send({
    error: error.name,
    message: error.message,
    statusCode: error.statusCode || 500
  });
}
