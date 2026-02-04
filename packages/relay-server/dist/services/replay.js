"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplayError = void 0;
exports.preventReplay = preventReplay;
const client_1 = require("../redis/client");
const DEDUP_TTL = 10 * 60; // 10 minutes
class ReplayError extends Error {
    constructor() {
        super(...arguments);
        this.name = 'ReplayError';
    }
}
exports.ReplayError = ReplayError;
async function preventReplay(eventId) {
    const key = `event:processed:${eventId}`;
    // Check if already processed
    const exists = await client_1.redis.exists(key);
    if (exists) {
        throw new ReplayError('Event already processed');
    }
    // Mark as processed (with expiry)
    await client_1.redis.setex(key, DEDUP_TTL, '1');
}
