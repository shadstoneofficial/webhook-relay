"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
const client_1 = require("./database/client");
const client_2 = require("./redis/client");
const logger_1 = require("./utils/logger");
const env_1 = require("./config/env");
async function main() {
    try {
        // Connect to dependencies
        await (0, client_1.connectDatabase)();
        await (0, client_2.connectRedis)();
        // Start server
        const server = await (0, server_1.createServer)();
        await server.listen({ port: env_1.config.port, host: '0.0.0.0' });
        logger_1.logger.info(`🦞 Relay server started on port ${env_1.config.port}`);
        // Graceful shutdown
        const shutdown = async (signal) => {
            logger_1.logger.info(`Received ${signal}, shutting down gracefully...`);
            await server.close();
            process.exit(0);
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    catch (error) {
        logger_1.logger.error(error, 'Failed to start server');
        process.exit(1);
    }
}
main();
