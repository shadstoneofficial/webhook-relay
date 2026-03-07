import { FastifyInstance } from 'fastify';
import { db } from '../database/client';
import { generateApiKey, hashApiKey } from '../services/auth';
import crypto from 'crypto';

export async function registerRouter(server: FastifyInstance) {
  // Common middleware to verify Admin Key
  const verifyAdmin = async (request: any, reply: any) => {
    const adminKey = request.headers['x-admin-key'];
    if (process.env.ADMIN_KEY && adminKey !== process.env.ADMIN_KEY) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or missing admin key' });
    }
  };

  // POST /register - Create a new agent
  server.post('/register', { preHandler: verifyAdmin }, async (request, reply) => {
    const body = request.body as any;
    const workspaceId = body.workspace_id;
    
    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);
    const relayId = `agt_${crypto.randomBytes(8).toString('hex')}`;
    
    const agent = await db.agents.create({
      data: {
        relay_id: relayId,
        api_key_hash: apiKeyHash,
        workspace_id: workspaceId,
        connection_type: 'websocket',
        metadata: body.metadata || {}
      }
    });
    
    return {
      relay_id: agent.relay_id,
      api_key: apiKey,
      webhook_url: `${process.env.PUBLIC_URL}/api/v1/webhook/${agent.relay_id}`
    };
  });

  // POST /rotate - Rotate keys for an existing agent (or replace an old one)
  server.post('/rotate', { preHandler: verifyAdmin }, async (request, reply) => {
    const body = request.body as any;
    const oldRelayId = body.old_relay_id;
    const workspaceId = body.workspace_id;

    // 1. If old_relay_id is provided, delete it (Rotation = Delete Old + Create New)
    if (oldRelayId) {
      try {
        await db.agents.delete({ where: { relay_id: oldRelayId } });
      } catch (e) {
        // Ignore if it doesn't exist, we just want to ensure it's gone
      }
    }

    // 2. Create new agent (Same logic as register)
    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);
    const newRelayId = `agt_${crypto.randomBytes(8).toString('hex')}`;

    const agent = await db.agents.create({
      data: {
        relay_id: newRelayId,
        api_key_hash: apiKeyHash,
        workspace_id: workspaceId,
        connection_type: 'websocket',
        metadata: body.metadata || {}
      }
    });

    return {
      relay_id: agent.relay_id,
      api_key: apiKey,
      webhook_url: `${process.env.PUBLIC_URL}/api/v1/webhook/${agent.relay_id}`
    };
  });
}
