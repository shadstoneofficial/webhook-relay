"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySignature = verifySignature;
const crypto_1 = __importDefault(require("crypto"));
function verifySignature(payload, timestamp, signature, secret) {
    // Construct signed payload (timestamp + body)
    const body = JSON.stringify(payload);
    const signedPayload = `${timestamp}.${body}`;
    // Compute expected signature
    const expectedSignature = crypto_1.default
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');
    // Extract received signature (remove "sha256=" prefix)
    const receivedSignature = signature.replace('sha256=', '');
    // Timing-safe comparison
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(receivedSignature, 'hex'));
    }
    catch {
        return false;
    }
}
