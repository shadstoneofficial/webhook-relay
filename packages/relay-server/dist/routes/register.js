"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRouter = registerRouter;
const client_1 = require("../database/client");
const auth_1 = require("../services/auth");
const crypto_1 = __importDefault(require("crypto"));
async function registerRouter(server) {
    server.post('/register', async (request, reply) => {
        // In a real app, this should be authenticated (e.g. by PowerLobster main API)
        // For now, we allow open registration for demo purposes or use a master key
        // const masterKey = request.headers['x-admin-key'];
        // if (masterKey !== process.env.ADMIN_KEY) ...
        const body = request.body;
        const workspaceId = body.workspace_id;
        const apiKey = (0, auth_1.generateApiKey)();
        const apiKeyHash = await (0, auth_1.hashApiKey)(apiKey);
        const relayId = `agt_${crypto_1.default.randomBytes(8).toString('hex')}`;
        const agent = await client_1.db.agents.create({
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
