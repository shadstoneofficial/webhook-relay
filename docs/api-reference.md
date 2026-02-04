# API Reference

Complete reference for the PowerLobster Webhook Relay REST API and WebSocket protocol.

---

## Table of Contents

1. [REST API](#rest-api)
2. [WebSocket Protocol](#websocket-protocol)
3. [Authentication](#authentication)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)

---

## REST API {#rest-api}

**Base URL:**
- **Hosted:** `https://relay.powerlobster.com/api/v1`
- **Self-Hosted:** `https://your-relay.example.com/api/v1`

### Endpoints

#### Health Check

**`GET /health`**

Check if the relay service is running.

**Request:**
```bash
curl https://relay.powerlobster.com/api/v1/health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": 1738425600000,
  "uptime": 86400
}
```

**Status Codes:**
- `200 OK` — Service is healthy
- `503 Service Unavailable` — Service is degraded (e.g., database down)

---

#### Receive Webhook (PowerLobster → Relay)

**`POST /webhook/:relay_id`**

Receive webhooks from PowerLobster and forward to connected agent.

**Request:**
```bash
curl -X POST https://relay.powerlobster.com/api/v1/webhook/agt_abc123 \
  -H "Content-Type: application/json" \
  -H "X-PowerLobster-Signature: sha256=abc123..." \
  -H "X-PowerLobster-Timestamp: 1738425600000" \
  -d '{
    "event": "message.received",
    "workspace_id": "ws_xyz789",
    "data": {
      "message_id": "msg_456",
      "text": "Hello!"
    }
  }'
```

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `X-PowerLobster-Signature` | Yes | HMAC-SHA256 signature (format: `sha256=<hex>`) |
| `X-PowerLobster-Timestamp` | Yes | Unix timestamp (milliseconds) |

**Request Body:**
```json
{
  "event": "message.received",
  "workspace_id": "ws_xyz789",
  "data": {
    // Event-specific payload
  }
}
```

**Response (Success):**
```json
{
  "status": "delivered",
  "relay_id": "agt_abc123",
  "timestamp": 1738425600123
}
```

**Response (Agent Offline):**
```json
{
  "status": "queued",
  "relay_id": "agt_abc123",
  "message": "Agent offline; event queued for delivery",
  "retry_count": 0
}
```

**Status Codes:**
- `200 OK` — Event delivered to agent
- `202 Accepted` — Event queued (agent offline)
- `401 Unauthorized` — Invalid signature
- `404 Not Found` — Relay ID not found
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Relay error

---

#### Register Agent (HTTP-Only Mode)

**`POST /register`**

Register an agent with HTTP callback endpoint (alternative to WebSocket).

**Request:**
```bash
curl -X POST https://relay.powerlobster.com/api/v1/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_your_api_key" \
  -d '{
    "workspace_id": "ws_xyz789",
    "http_endpoint": "https://myagent.local/webhook",
    "metadata": {
      "name": "My Agent",
      "version": "1.0.0"
    }
  }'
```

**Request Body:**
```json
{
  "workspace_id": "ws_xyz789",
  "http_endpoint": "https://myagent.local/webhook",
  "metadata": {
    "name": "My Agent",
    "version": "1.0.0"
  }
}
```

**Response:**
```json
{
  "relay_id": "agt_abc123",
  "api_key": "sk_generated_key_456",
  "webhook_url": "https://relay.powerlobster.com/api/v1/webhook/agt_abc123",
  "created_at": "2025-02-01T12:00:00Z"
}
```

**Status Codes:**
- `201 Created` — Agent registered
- `400 Bad Request` — Invalid input
- `401 Unauthorized` — Invalid API key
- `409 Conflict` — Relay ID already exists

**⚠️ Security Note:**
- The `http_endpoint` is encrypted at rest (AES-256-GCM)
- Never log or expose this endpoint
- Use HTTPS only for HTTP endpoints

---

#### Service Statistics (Admin)

**`GET /stats`**

Get service metrics (requires admin API key).

**Request:**
```bash
curl https://relay.powerlobster.com/api/v1/stats \
  -H "Authorization: Bearer admin_api_key"
```

**Response:**
```json
{
  "agents": {
    "total": 1234,
    "connected": 987,
    "disconnected": 247
  },
  "events": {
    "delivered_24h": 45678,
    "queued": 12,
    "failed_24h": 3
  },
  "performance": {
    "avg_latency_ms": 45,
    "p99_latency_ms": 120,
    "uptime_seconds": 864000
  },
  "timestamp": 1738425600000
}
```

**Status Codes:**
- `200 OK` — Statistics returned
- `401 Unauthorized` — Invalid admin key
- `403 Forbidden` — Insufficient permissions

---

## WebSocket Protocol {#websocket-protocol}

**Endpoint:**
```
wss://relay.powerlobster.com/api/v1/connect
```

### Connection Flow

**1. Client connects to WebSocket endpoint**

**2. Client sends authentication message:**
```json
{
  "type": "auth",
  "relay_id": "agt_abc123",
  "api_key": "sk_your_api_key",
  "version": "1.0.0"
}
```

**3. Server responds:**

**Success:**
```json
{
  "type": "auth_success",
  "relay_id": "agt_abc123",
  "webhook_url": "https://relay.powerlobster.com/api/v1/webhook/agt_abc123",
  "session_id": "sess_xyz789",
  "timestamp": 1738425600000
}
```

**Error:**
```json
{
  "type": "auth_error",
  "error": "invalid_api_key",
  "message": "Authentication failed: invalid or expired API key",
  "timestamp": 1738425600000
}
```

### Message Types

#### 1. Webhook Event (Server → Client)

Deliver webhook event to agent.

```json
{
  "type": "webhook",
  "id": "evt_unique123",
  "timestamp": 1738425600000,
  "signature": "sha256=abc123...",
  "payload": {
    "event": "message.received",
    "workspace_id": "ws_xyz789",
    "data": {
      "message_id": "msg_456",
      "text": "Hello from PowerLobster!"
    }
  }
}
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Always `"webhook"` |
| `id` | `string` | Unique event ID (for deduplication) |
| `timestamp` | `number` | Unix timestamp (milliseconds) |
| `signature` | `string` | HMAC-SHA256 signature of payload |
| `payload` | `object` | Original webhook data from PowerLobster |

#### 2. Acknowledgment (Client → Server)

Acknowledge receipt of webhook event.

```json
{
  "type": "ack",
  "id": "evt_unique123",
  "timestamp": 1738425600123
}
```

**⚠️ Important:**
- Clients MUST send `ack` within 30 seconds
- Unacknowledged events will be retried (up to 3 times)
- Failed events moved to dead letter queue after max retries

#### 3. Heartbeat (Server → Client)

Server sends periodic ping to check connection health.

```json
{
  "type": "ping",
  "timestamp": 1738425600000
}
```

#### 4. Heartbeat Response (Client → Server)

Client responds to ping.

```json
{
  "type": "pong",
  "timestamp": 1738425600123
}
```

**⚠️ Important:**
- Server sends `ping` every 30 seconds (configurable)
- Client MUST respond with `pong` within 10 seconds
- Connection closed if 3 consecutive pongs missed

#### 5. Error (Server → Client)

Server encountered an error processing client message.

```json
{
  "type": "error",
  "error": "invalid_message",
  "message": "Message type 'foobar' is not supported",
  "timestamp": 1738425600000
}
```

**Common Error Codes:**
| Code | Description |
|------|-------------|
| `invalid_message` | Malformed JSON or unknown message type |
| `rate_limit_exceeded` | Too many messages sent |
| `authentication_required` | Not authenticated (sent auth after timeout) |
| `internal_error` | Server-side error |

#### 6. Disconnection (Server → Client)

Server is gracefully closing the connection.

```json
{
  "type": "disconnect",
  "reason": "server_shutdown",
  "message": "Server is restarting for maintenance",
  "reconnect_after_ms": 30000,
  "timestamp": 1738425600000
}
```

**Reasons:**
| Reason | Description | Action |
|--------|-------------|--------|
| `server_shutdown` | Planned maintenance | Reconnect after delay |
| `rate_limit_exceeded` | Too many requests | Backoff and retry |
| `authentication_expired` | API key expired | Refresh credentials |
| `duplicate_connection` | Same relay_id connected elsewhere | Check for duplicate instances |

---

## Authentication {#authentication}

### API Key Format

**Agent API Keys:**
```
sk_<base64url>_<32-bytes-hex>
```

**Example:**
```
sk_abc123xyz789_0f1e2d3c4b5a69788796a5b4c3d2e1f0
```

### Authentication Methods

#### 1. WebSocket (Recommended)

Send `auth` message immediately after connection:

```javascript
const ws = new WebSocket('wss://relay.powerlobster.com/api/v1/connect');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'auth',
    relay_id: 'agt_abc123',
    api_key: 'sk_...',
    version: '1.0.0'
  }));
});
```

#### 2. HTTP (Registration Only)

Use `Authorization` header with Bearer token:

```bash
curl -H "Authorization: Bearer sk_..." https://relay.powerlobster.com/api/v1/register
```

### Signature Verification

**PowerLobster signs all webhooks with HMAC-SHA256.**

**Verify signature (Node.js):**
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  const receivedSignature = signature.replace('sha256=', '');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(receivedSignature)
  );
}

// Usage
const isValid = verifyWebhookSignature(
  req.body,
  req.headers['x-powerlobster-signature'],
  process.env.WEBHOOK_SECRET
);
```

**Verify signature (Python):**
```python
import hmac
import hashlib

def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    received = signature.replace('sha256=', '')
    
    return hmac.compare_digest(expected, received)

# Usage
is_valid = verify_webhook_signature(
    request.body,
    request.headers['X-PowerLobster-Signature'],
    os.environ['WEBHOOK_SECRET']
)
```

---

## Error Handling {#error-handling}

### HTTP Error Responses

**Standard Error Format:**
```json
{
  "error": "rate_limit_exceeded",
  "message": "You have exceeded the rate limit of 100 requests per minute",
  "details": {
    "limit": 100,
    "window_ms": 60000,
    "retry_after_ms": 15000
  },
  "timestamp": 1738425600000,
  "request_id": "req_abc123"
}
```

### Error Codes

| HTTP Code | Error Code | Description |
|-----------|------------|-------------|
| 400 | `bad_request` | Invalid request body or parameters |
| 401 | `unauthorized` | Missing or invalid authentication |
| 403 | `forbidden` | Insufficient permissions |
| 404 | `not_found` | Resource does not exist |
| 409 | `conflict` | Resource already exists |
| 429 | `rate_limit_exceeded` | Too many requests |
| 500 | `internal_error` | Server-side error |
| 503 | `service_unavailable` | Service temporarily down |

### Retry Logic

**Client Retry Guidelines:**

| Error Code | Retry? | Strategy |
|------------|--------|----------|
| 4xx (except 429) | ❌ No | Fix client error |
| 429 | ✅ Yes | Exponential backoff |
| 5xx | ✅ Yes | Exponential backoff (max 3 retries) |

**Exponential Backoff:**
```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = Math.min(1000 * Math.pow(2, i), 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## Rate Limiting {#rate-limiting}

### Limits

**Per Agent:**
- **100 webhook deliveries per minute** (default)
- Configurable via `RATE_LIMIT_MAX_REQUESTS`

**Global:**
- **10,000 events per second** (horizontal scaling)

### Headers

**Rate limit headers included in responses:**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1738425660000
```

**When rate limit exceeded:**

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1738425660000
Retry-After: 15

{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Retry after 15 seconds.",
  "retry_after_ms": 15000
}
```

### Best Practices

1. **Respect rate limits** — Cache `X-RateLimit-Remaining` and throttle requests
2. **Handle 429 gracefully** — Use `Retry-After` header for backoff
3. **Batch events** — If possible, group multiple operations
4. **Monitor usage** — Track your rate limit consumption

---

## SDK Examples

### Node.js SDK

**Full example:**
```javascript
import { WebhookRelay } from '@powerlobster/webhook';

const relay = new WebhookRelay({
  relayUrl: 'wss://relay.powerlobster.com',
  apiKey: process.env.POWERLOBSTER_API_KEY,
  autoReconnect: true,
  reconnectDelay: 5000,
  heartbeatInterval: 30000
});

// Event handlers
relay.on('connected', (info) => {
  console.log('✅ Connected to relay');
  console.log('Webhook URL:', info.webhookUrl);
  console.log('Session ID:', info.sessionId);
});

relay.on('webhook', async (event) => {
  console.log('📬 Received event:', event.id);
  console.log('Type:', event.payload.event);
  console.log('Data:', event.payload.data);
  
  // Process event (auto-acknowledges on return)
  await processWebhook(event.payload);
  
  // Or manually control acknowledgment:
  // return false; // Don't acknowledge (will retry)
  // throw new Error('Processing failed'); // Don't acknowledge
});

relay.on('error', (error) => {
  console.error('❌ Relay error:', error.message);
});

relay.on('disconnected', (reason) => {
  console.log('🔌 Disconnected:', reason);
});

relay.on('reconnecting', (attempt) => {
  console.log(`🔄 Reconnecting (attempt ${attempt})...`);
});

// Connect
await relay.connect();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await relay.disconnect();
  process.exit(0);
});
```

### Python SDK

**Full example:**
```python
import os
from powerlobster_webhook import WebhookRelay

relay = WebhookRelay(
    relay_url="wss://relay.powerlobster.com",
    api_key=os.environ["POWERLOBSTER_API_KEY"],
    auto_reconnect=True,
    reconnect_delay=5.0,
    heartbeat_interval=30.0
)

@relay.on_connected
def on_connected(info):
    print(f"✅ Connected to relay")
    print(f"Webhook URL: {info.webhook_url}")
    print(f"Session ID: {info.session_id}")

@relay.on_webhook
async def on_webhook(event):
    print(f"📬 Received event: {event.id}")
    print(f"Type: {event.payload['event']}")
    print(f"Data: {event.payload['data']}")
    
    # Process event (auto-acknowledges unless exception raised)
    await process_webhook(event.payload)

@relay.on_error
def on_error(error):
    print(f"❌ Relay error: {error}")

@relay.on_disconnected
def on_disconnected(reason):
    print(f"🔌 Disconnected: {reason}")

@relay.on_reconnecting
def on_reconnecting(attempt):
    print(f"🔄 Reconnecting (attempt {attempt})...")

# Connect (blocks until disconnected)
relay.connect()
```

---

## Versioning

**API Version:** `v1` (current)

**Versioning Strategy:**
- Breaking changes increment major version (`v2`, `v3`, etc.)
- Backward-compatible changes added to current version
- Deprecated endpoints supported for 12 months minimum

**Check version:**
```bash
curl https://relay.powerlobster.com/api/v1/health | jq .version
```

---

## Support

- **API Issues:** https://github.com/powerlobster-hq/webhook-relay/issues
- **Documentation:** https://docs.powerlobster.com/webhook-relay
- **Discord:** https://discord.gg/powerlobster
