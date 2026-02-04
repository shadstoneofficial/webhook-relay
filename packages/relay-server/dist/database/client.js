"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.connectDatabase = connectDatabase;
const client_1 = require("@prisma/client");
exports.db = new client_1.PrismaClient();
async function connectDatabase() {
    await exports.db.$connect();
}
