import crypto from 'crypto';

export function verifySignature(
  payload: any,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const body = JSON.stringify(payload);
  const signedPayload = `${timestamp}.${body}`;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  
  const receivedSignature = signature.replace('sha256=', '');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );
  } catch {
    return false;
  }
}
