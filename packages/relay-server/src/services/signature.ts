import crypto from 'crypto';

export function verifySignature(
  payload: any,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  // Construct signed payload (timestamp + body)
  const body = JSON.stringify(payload);
  const signedPayload = `${timestamp}.${body}`;
  
  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  
  // Extract received signature (remove "sha256=" prefix)
  const receivedSignature = signature.replace('sha256=', '');
  
  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );
  } catch {
    return false;
  }
}
