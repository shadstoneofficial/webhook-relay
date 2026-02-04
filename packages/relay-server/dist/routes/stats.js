"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRouter = statsRouter;
async function statsRouter(server) {
    server.get('/stats', async (request, reply) => {
        // TODO: Implement actual stats gathering
        return {
            agents_connected: 0,
            messages_processed: 0,
            uptime: process.uptime()
        };
    });
}
