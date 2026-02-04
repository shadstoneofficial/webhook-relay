import { createServer } from './server';
import { connectDatabase } from './database/client';
import { connectRedis } from './redis/client';
import { logger } from './utils/logger';
import { config } from './config/env';

async function main() {
  try {
    // Connect to dependencies
    await connectDatabase();
    await connectRedis();
    
    // Start server
    const server = await createServer();
    await server.listen({ port: config.port, host: '0.0.0.0' });
    
    logger.info(`🦞 Relay server started on port ${config.port}`);
    
    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await server.close();
      process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

main();
