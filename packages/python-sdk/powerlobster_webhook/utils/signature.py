"""HMAC signature verification utilities."""

import hmac
import hashlib
import json
from typing import Any, Dict


def verify_signature(
    payload: Dict[str, Any],
    timestamp: str,
    signature: str,
    secret: str
) -> bool:
    """
    Verify HMAC-SHA256 signature.
    
    Args:
        payload: Webhook payload
        timestamp: Unix timestamp (milliseconds)
        signature: HMAC signature (sha256=...)
        secret: Shared secret key
    
    Returns:
        True if signature is valid
    """
    body = json.dumps(payload, separators=(',', ':'))
    signed_payload = f"{timestamp}.{body}"
    
    expected_signature = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    received_signature = signature.replace('sha256=', '')
    
    return hmac.compare_digest(expected_signature, received_signature)
