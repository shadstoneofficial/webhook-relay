import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../database/client';

const BCRYPT_ROUNDS = 12;

export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const base64Url = randomBytes.toString('base64url').replace(/=/g, '');
  const hexSuffix = crypto.randomBytes(16).toString('hex');
  return `sk_${base64Url}_${hexSuffix}`;
}

export async function hashApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, BCRYPT_ROUNDS);
}

export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(apiKey, hash);
}

export async function getAgentByRelayId(relayId: string) {
  return db.agents.findUnique({
    where: { relay_id: relayId }
  });
}
