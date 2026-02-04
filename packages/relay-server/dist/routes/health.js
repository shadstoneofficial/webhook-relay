"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = healthRouter;
async function healthRouter(server) {
    server.get('/health', async (request, reply) => {
        return { status: 'healthy', version: '1.0.0' };
    });
}
