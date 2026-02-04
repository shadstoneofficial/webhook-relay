"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.connectRedis = connectRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
exports.redis = new ioredis_1.default(env_1.config.redisUrl, {
    lazyConnect: true
});
async function connectRedis() {
    try {
        await exports.redis.connect();
        logger_1.logger.info('Connected to Redis');
    }
    catch (error) {
        logger_1.logger.error(error, 'Failed to connect to Redis');
        throw error;
    }
}
