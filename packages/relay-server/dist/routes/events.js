"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventsRouter = eventsRouter;
const client_1 = require("../database/client");
const auth_1 = require("../services/auth");
async function eventsRouter(server) {
    // GET /pending/:relay_id
    // Returns all queued events for the agent.
    server.get('/pending/:relay_id', async (request, reply) => {
        const { relay_id } = request.params;
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid Authorization header' });
        }
        const apiKey = authHeader.split(' ')[1];
        // 1. Verify Agent
        const agent = await (0, auth_1.getAgentByRelayId)(relay_id);
        if (!agent) {
            return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
        }
        const isValid = await (0, auth_1.verifyApiKey)(apiKey, agent.api_key_hash);
        if (!isValid) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Invalid API Key' });
        }
        // 2. Fetch Queued Events
        const events = await client_1.db.webhook_events.findMany({
            where: {
                relay_id: relay_id,
                status: 'queued'
            },
            orderBy: {
                created_at: 'asc'
            },
            take: 100 // Limit to 100 at a time to prevent overload
        });
        // 3. Optional: Auto-Ack if requested via query param ?ack=true
        const { ack } = request.query;
        if (ack === 'true' && events.length > 0) {
            const eventIds = events.map(e => e.id);
            await client_1.db.webhook_events.updateMany({
                where: {
                    id: { in: eventIds }
                },
                data: {
                    status: 'delivered',
                    delivered_at: new Date()
                }
            });
        }
        return {
            count: events.length,
            events: events.map(e => ({
                id: e.id,
                event_id: e.event_id,
                payload: e.payload,
                created_at: e.created_at
            }))
        };
    });
    // DELETE /events/:relay_id/:event_id
    // Explicitly acknowledge/delete a specific event
    server.delete('/events/:relay_id/:event_id', async (request, reply) => {
        const { relay_id, event_id } = request.params;
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Missing Authorization header' });
        }
        const apiKey = authHeader.split(' ')[1];
        // 1. Verify Agent
        const agent = await (0, auth_1.getAgentByRelayId)(relay_id);
        if (!agent) {
            return reply.code(404).send({ error: 'not_found', message: 'Agent not found' });
        }
        const isValid = await (0, auth_1.verifyApiKey)(apiKey, agent.api_key_hash);
        if (!isValid) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Invalid API Key' });
        }
        // 2. Mark as delivered
        // Note: We search by `event_id` (the external ID) or internal `id`? 
        // The proposal says `event_id`, but let's support both or stick to internal ID for safety.
        // Let's assume `event_id` refers to the internal UUID for simplicity, or the external unique ID.
        // The schema has `event_id` (external) and `id` (internal UUID).
        // Let's use internal UUID for precise deletion.
        const result = await client_1.db.webhook_events.updateMany({
            where: {
                relay_id: relay_id,
                id: event_id, // Internal UUID
                status: 'queued'
            },
            data: {
                status: 'delivered',
                delivered_at: new Date()
            }
        });
        if (result.count === 0) {
            return reply.code(404).send({ error: 'not_found', message: 'Event not found or already delivered' });
        }
        return { success: true, message: 'Event acknowledged' };
    });
}
