"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptEndpoint = encryptEndpoint;
exports.decryptEndpoint = decryptEndpoint;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
function encryptEndpoint(endpoint, key) {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = crypto_1.default.randomBytes(12); // 12 bytes for GCM
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, keyBuffer, iv);
    let encrypted = cipher.update(endpoint, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    // Return: iv + authTag + ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
function decryptEndpoint(encryptedData, key) {
    const keyBuffer = Buffer.from(key, 'hex');
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
