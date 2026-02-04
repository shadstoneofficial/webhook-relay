"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateApiKey = generateApiKey;
exports.hashApiKey = hashApiKey;
exports.verifyApiKey = verifyApiKey;
exports.getAgentByRelayId = getAgentByRelayId;
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../database/client");
const BCRYPT_ROUNDS = 12;
function generateApiKey() {
    const randomBytes = crypto_1.default.randomBytes(32);
    const base64Url = randomBytes.toString('base64url').replace(/=/g, '');
    const hexSuffix = crypto_1.default.randomBytes(16).toString('hex');
    return `sk_${base64Url}_${hexSuffix}`;
}
async function hashApiKey(apiKey) {
    return bcrypt_1.default.hash(apiKey, BCRYPT_ROUNDS);
}
async function verifyApiKey(apiKey, hash) {
    return bcrypt_1.default.compare(apiKey, hash);
}
async function getAgentByRelayId(relayId) {
    return client_1.db.agents.findUnique({
        where: { relay_id: relayId }
    });
}
