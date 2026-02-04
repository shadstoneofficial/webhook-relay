import { FastifyInstance } from 'fastify';
import { db } from '../database/client';
import { generateApiKey, hashApiKey } from '../services/auth';
import crypto from 'crypto';

export async function registerRouter(server: FastifyInstance) {
  server.post('/register', async (request, reply) => {
    // In a real app, this should be authenticated (e.g. by PowerLobster main API)
    // For now, we allow open registration for demo purposes or use a master key
    
    // const masterKey = request.headers['x-admin-key'];
    // if (masterKey !== process.env.ADMIN_KEY) ...

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
}
