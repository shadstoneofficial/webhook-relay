import { FastifyInstance } from 'fastify';
import { db } from '../../database/client';

export async function adminRouter(server: FastifyInstance) {
  server.addHook('onRequest', async (request, reply) => {
    const logKey = request.headers['x-relaylog-key'] as string;
    if (!process.env.RELAYLOG_KEY || logKey !== process.env.RELAYLOG_KEY) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid Relay Log Key' });
    }
  });

  server.get('/agents', async (request, reply) => {
    const agents = await db.agents.findMany({
      orderBy: { created_at: 'desc' },
      take: 100
    });
    return { count: agents.length, agents };
  });

  server.get('/events/:relay_id', async (request, reply) => {
    const { relay_id } = request.params as { relay_id: string };
    const events = await db.webhook_events.findMany({
      where: { relay_id },
      orderBy: { created_at: 'desc' },
      take: 50
    });
    return { count: events.length, events };
  });

  server.get('/logs/:relay_id', async (request, reply) => {
    const { relay_id } = request.params as { relay_id: string };
    // @ts-ignore
    const logs = await db.relay_logs.findMany({
      where: { relay_id },
      orderBy: { created_at: 'desc' },
      take: 50
    });
    return { count: logs.length, logs };
  });

  server.delete('/agents/:relay_id', async (request, reply) => {
    const { relay_id } = request.params as { relay_id: string };
    
    // Delete associated logs and events first? 
    // Usually cascade delete handles this, but let's be safe or just delete the agent record.
    // The schema doesn't specify cascade, so we might need to clean up manually or just leave orphans for audit.
    // Let's just delete the agent record for now to revoke access.
    
    try {
      await db.agents.delete({
        where: { relay_id }
      });
      return { success: true, message: `Agent ${relay_id} deactivated` };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to delete agent', details: error });
    }
  });
}
