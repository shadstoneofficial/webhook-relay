# PowerLobster Webhook Relay Architecture

**Version:** 1.0.0-alpha  
**Status:** Specification  
**Last Updated:** 2025-02-01

---

## Overview

The PowerLobster Webhook Relay is a hybrid webhook delivery system that enables PowerLobster agents to receive real-time webhook notifications without requiring public IP addresses or exposing local servers to the internet.

**Problem Statement:**
- PowerLobster agents need to receive `message.received` and other webhook events
- Most agents run on local machines, behind firewalls, or on dynamic IPs
- Traditional webhooks require publicly accessible HTTPS endpoints
- Polling is inefficient and introduces latency

**Solution:**
- **Hosted Relay Service**: PowerLobster-managed relay (primary option for most users)
- **Self-Hosted Option**: Open-source relay server (for privacy-conscious or enterprise users)
- **Client SDKs**: Easy integration libraries for Node.js and Python

---

## System Architecture

### High-Level Components

```
┌─────────────────┐
│  PowerLobster   │
│   API Server    │
└────────┬────────┘
         │ HTTPS POST (webhook)
         │
         ▼
┌─────────────────────────────────┐
│    Webhook Relay Service        │
│  ┌──────────────────────────┐   │
│  │  Webhook Receiver API    │   │
│  │  (Express.js/Fastify)    │   │
│  └───────────┬──────────────┘   │
│              │                   │
│  ┌───────────▼──────────────┐   │
│  │  Agent Registry          │   │
│  │  (Redis/PostgreSQL)      │   │
│  └───────────┬──────────────┘   │
│              │                   │
│  ┌───────────▼──────────────┐   │
│  │  WebSocket Manager       │   │
│  │  (Socket.io/ws)          │   │
│  └───────────┬──────────────┘   │
└──────────────┼──────────────────┘
               │ WebSocket
               ▼
    ┌──────────────────────┐
    │  PowerLobster Agent  │
    │  (with Relay SDK)    │
    └──────────────────────┘
```

### Data Flow

**1. Agent Registration Flow:**
```
Agent SDK                    Relay Service                 Agent Registry
    │                             │                              │
    ├──── Connect WebSocket ─────▶│                              │
    │                             │                              │
    │                             ├──── Generate Agent ID ──────▶│
    │                             │                              │
    │                             │◀──── Store Registration ─────┤
    │                             │                              │
    │◀──── Return Agent ID ───────┤                              │
    │     + Webhook URL           │                              │
```

**2. Webhook Delivery Flow:**
```
PowerLobster API          Relay Service              Agent SDK
    │                          │                         │
    ├─── POST /webhook ───────▶│                         │
    │    (HMAC signed)          │                         │
    │                          │                         │
    │                          ├─── Verify Signature     │
    │                          │                         │
    │                          ├─── Lookup Agent(s) ─────┤
    │                          │                         │
    │                          ├─── Push via WS ────────▶│
    │                          │                         │
    │                          │◀──── ACK ───────────────┤
    │                          │                         │
    │◀──── 200 OK ─────────────┤                         │
```

**3. Fallback HTTP Delivery (Optional):**
```
Relay Service                                     Agent HTTP Endpoint
    │                                                      │
    ├────── POST /webhook (encrypted payload) ───────────▶│
    │       + X-Relay-Signature                           │
    │                                                      │
    │◀────── 200 OK ───────────────────────────────────────┤
```

---

## Component Specifications

### 1. Relay Server

**Technology Stack:**
- **Runtime:** Node.js 18+ (TypeScript)
- **Framework:** Fastify (performance) or Express (simplicity)
- **WebSocket:** Socket.io or `ws` library
- **Database:** Redis (ephemeral sessions) + PostgreSQL (persistent config)
- **Queue:** BullMQ (for retry/async processing)

**Core Responsibilities:**
- Receive webhooks from PowerLobster API
- Verify HMAC signatures
- Maintain WebSocket connections to agents
- Route events to correct agent(s)
- Handle connection failures and retries
- Rate limiting and abuse prevention

**Key Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/webhook/:relay_id` | Receive webhooks from PowerLobster |
| `WS` | `/api/v1/connect` | Agent WebSocket connection |
| `POST` | `/api/v1/register` | Register new agent (optional HTTP-only mode) |
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/stats` | Service metrics (admin) |

**Environment Variables:**
```bash
# Server
PORT=3000
NODE_ENV=production

# Security
WEBHOOK_SECRET=<powerlobster-hmac-secret>
RELAY_ENCRYPTION_KEY=<32-byte-hex>

# Database
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost/relay

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# WebSocket
WS_HEARTBEAT_INTERVAL=30000
WS_CONNECTION_TIMEOUT=60000
```

### 2. Agent Registry

**Data Model (PostgreSQL):**

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relay_id VARCHAR(64) UNIQUE NOT NULL,  -- Public relay ID
  api_key_hash VARCHAR(128) NOT NULL,     -- Hashed agent API key
  workspace_id VARCHAR(128),              -- PowerLobster workspace ID
  connection_type VARCHAR(16) NOT NULL,   -- 'websocket' | 'http'
  http_endpoint_encrypted TEXT,           -- AES-encrypted HTTP callback URL
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP,
  metadata JSONB                          -- Custom agent metadata
);

CREATE INDEX idx_agents_relay_id ON agents(relay_id);
CREATE INDEX idx_agents_workspace ON agents(workspace_id);
```

**Session Storage (Redis):**
```
# Active WebSocket connections
ws:agent:{relay_id} → { socket_id, connected_at, user_agent }

# Rate limiting
ratelimit:{relay_id}:{window} → request_count (expires)

# Delivery queue
queue:pending:{relay_id} → [ event_id_1, event_id_2, ... ]
```

### 3. WebSocket Protocol

**Connection Handshake:**
```javascript
// Client → Server
{
  "type": "auth",
  "relay_id": "agt_abc123...",
  "api_key": "sk_xyz...",
  "version": "1.0.0"
}

// Server → Client (success)
{
  "type": "auth_success",
  "relay_id": "agt_abc123...",
  "webhook_url": "https://relay.powerlobster.com/api/v1/webhook/agt_abc123..."
}

// Server → Client (error)
{
  "type": "auth_error",
  "error": "invalid_api_key",
  "message": "Authentication failed"
}
```

**Event Delivery:**
```javascript
// Server → Client
{
  "type": "webhook",
  "id": "evt_unique123",
  "timestamp": 1738425600000,
  "signature": "sha256=...",  // HMAC of payload
  "payload": {
    "event": "message.received",
    "workspace_id": "ws_123",
    "data": { ... }
  }
}

// Client → Server (acknowledge)
{
  "type": "ack",
  "id": "evt_unique123"
}
```

**Heartbeat (Keep-Alive):**
```javascript
// Server → Client (every 30s)
{ "type": "ping", "timestamp": 1738425600000 }

// Client → Server
{ "type": "pong", "timestamp": 1738425600000 }
```

### 4. Client SDKs

**Node.js SDK (`@powerlobster/webhook`):**
```typescript
import { WebhookRelay } from '@powerlobster/webhook';

const relay = new WebhookRelay({
  relayUrl: 'wss://relay.powerlobster.com',
  apiKey: 'sk_...',
  // Optional: fallback HTTP endpoint
  httpEndpoint: 'https://myagent.local/webhook'
});

// Connect and receive events
relay.on('connected', (info) => {
  console.log('Webhook URL:', info.webhookUrl);
});

relay.on('webhook', async (event) => {
  console.log('Received:', event.payload);
  // Auto-acknowledges unless you return false or throw
});

relay.on('error', (err) => {
  console.error('Relay error:', err);
});

await relay.connect();
```

**Python SDK (`powerlobster-webhook`):**
```python
from powerlobster_webhook import WebhookRelay

relay = WebhookRelay(
    relay_url="wss://relay.powerlobster.com",
    api_key="sk_..."
)

@relay.on_webhook
async def handle_webhook(event):
    print(f"Received: {event.payload}")
    # Auto-acknowledges unless exception raised

@relay.on_connected
def on_connected(info):
    print(f"Webhook URL: {info.webhook_url}")

relay.connect()  # Blocks and handles events
```

---

## Security Model

### 1. Authentication Layers

**PowerLobster → Relay:**
- HMAC-SHA256 signature in `X-PowerLobster-Signature` header
- Shared secret configured in PowerLobster webhook settings
- Timestamp validation (reject events older than 5 minutes)

**Agent → Relay:**
- API key authentication (Bearer token)
- Per-agent unique `relay_id` and `api_key`
- API keys hashed (bcrypt) in database

### 2. Encryption

**At Rest:**
- HTTP callback URLs encrypted with AES-256-GCM
- Encryption key stored in environment (`RELAY_ENCRYPTION_KEY`)
- Never log or expose agent endpoints

**In Transit:**
- All connections over TLS 1.3
- WebSocket connections over WSS (TLS)
- Certificate pinning recommended for self-hosted deployments

### 3. Replay Attack Prevention

**Event Deduplication:**
```javascript
// Redis: Store event IDs with 10-minute TTL
SET event:processed:{event_id} "1" EX 600

// Before processing, check:
if (await redis.exists(`event:processed:${eventId}`)) {
  return; // Already processed
}
```

**Timestamp Validation:**
```javascript
const timestamp = parseInt(headers['x-powerlobster-timestamp']);
const now = Date.now();
const MAX_AGE = 5 * 60 * 1000; // 5 minutes

if (Math.abs(now - timestamp) > MAX_AGE) {
  throw new Error('Event timestamp too old or in future');
}
```

### 4. Rate Limiting

**Per-Relay ID:**
- 100 webhook deliveries per minute (configurable)
- 429 Too Many Requests on exceeded limit
- Exponential backoff recommended for clients

**Global:**
- 10,000 events/second total (horizontal scaling)
- DDoS protection via Cloudflare or similar

---

## Scalability Considerations

### Horizontal Scaling

**Stateless Relay Servers:**
- Multiple relay server instances behind load balancer
- Sticky sessions for WebSocket connections (IP hash or cookie)
- Shared Redis for session state
- PostgreSQL replicas for read scaling

**WebSocket Scaling Pattern:**
```
┌─────────────┐
│   HAProxy   │ (Layer 4 load balancer)
└──────┬──────┘
       │
   ┌───┴────┬────────┬────────┐
   ▼        ▼        ▼        ▼
┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐
│ WS1 │  │ WS2 │  │ WS3 │  │ WS4 │  (Relay server instances)
└──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘
   └────────┴────────┴────────┘
            │
    ┌───────▼────────┐
    │  Redis Cluster │ (Session + PubSub)
    └────────────────┘
```

**Inter-Server Communication:**
- Redis Pub/Sub for cross-server event routing
- When webhook arrives at Server A, but agent connected to Server B:
  ```javascript
  // Server A receives webhook
  redis.publish(`relay:agent:${relayId}`, JSON.stringify(event));
  
  // Server B (subscribed) delivers to agent
  redis.subscribe(`relay:agent:*`, (channel, message) => {
    const event = JSON.parse(message);
    wsManager.send(event.relayId, event);
  });
  ```

### Performance Targets (MVP)

| Metric | Target | Notes |
|--------|--------|-------|
| Concurrent Agents | 10,000 per instance | With 8GB RAM, 4 vCPU |
| Webhook Latency | < 100ms (p99) | PowerLobster → Agent delivery |
| WebSocket Reconnect | < 5s | Automatic retry with backoff |
| Event Throughput | 1,000 events/sec/instance | Sustained load |
| Uptime | 99.9% | ~8.7 hours downtime/year |

### Database Scaling

**Redis:**
- Ephemeral data only (sessions, rate limits)
- Redis Cluster for horizontal scaling (6+ nodes)
- AOF persistence for critical queues

**PostgreSQL:**
- Read replicas for agent registry lookups
- Connection pooling (PgBouncer)
- Partitioning for audit logs (monthly partitions)

---

## Deployment Architectures

### Option A: PowerLobster-Hosted (SaaS)

**Infrastructure:**
- AWS/GCP/Cloudflare Workers (global edge deployment)
- Managed Redis (ElastiCache/Memorystore)
- Managed PostgreSQL (RDS/Cloud SQL)
- Cloudflare for DDoS protection + CDN

**Scaling:**
- Auto-scaling groups (2-20 instances)
- Multi-region deployment (us-east-1, eu-west-1, ap-southeast-1)
- Global load balancing with latency-based routing

**Cost Estimate (100 agents):**
- Compute: $50-100/month (2x t3.medium)
- Database: $30-50/month (Redis + PostgreSQL)
- Bandwidth: $10-20/month
- **Total: ~$100-200/month**

### Option B: Self-Hosted (Docker Compose)

**Minimum Requirements:**
- 2 GB RAM, 2 vCPU
- 10 GB storage
- Static IP or dynamic DNS
- TLS certificate (Let's Encrypt)

**Docker Compose Stack:**
```yaml
version: '3.8'
services:
  relay:
    image: powerlobster/webhook-relay:latest
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:password@db:5432/relay
    depends_on:
      - redis
      - db
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
  
  db:
    image: postgres:15-alpine
    volumes:
      - pg-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=relay
      - POSTGRES_PASSWORD=<change-me>
  
  caddy:
    image: caddy:2-alpine
    ports:
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data

volumes:
  redis-data:
  pg-data:
  caddy-data:
```

### Option C: Self-Hosted (Kubernetes)

**For enterprise deployments:**
- Helm chart provided
- Horizontal Pod Autoscaler for relay servers
- StatefulSets for Redis/PostgreSQL
- Ingress with cert-manager (automatic TLS)

---

## Extension Points (Future)

### Phase 2 Features
- **Multi-workspace support**: Single relay instance serving multiple PowerLobster workspaces
- **Event filtering**: Agents subscribe to specific event types only
- **Webhook retry policies**: Configurable retry logic (exponential backoff, max attempts)
- **Dead letter queue**: Permanent storage for failed deliveries
- **Admin dashboard**: Web UI for monitoring, agent management, logs

### Phase 3 Features
- **Edge deployment**: Cloudflare Workers or Deno Deploy for ultra-low latency
- **HTTP/2 Server Push**: For HTTP-only mode (where WebSocket unavailable)
- **GraphQL subscriptions**: Alternative to WebSocket for modern clients
- **Webhook transformations**: Custom JavaScript functions to transform events
- **Multi-protocol**: Support MQTT, gRPC, Server-Sent Events

---

## Migration Path

**From Polling to Relay:**
1. Agent installs SDK: `npm install @powerlobster/webhook`
2. Agent initializes relay connection (backward compatible with polling)
3. Agent receives `webhookUrl` from relay
4. User configures PowerLobster webhook URL in dashboard
5. SDK automatically disables polling when webhooks active

**Backward Compatibility:**
- SDK gracefully falls back to polling if relay unavailable
- Existing agents continue to work without changes
- Gradual rollout: relay opt-in during beta

---

## Security Checklist

- [ ] All connections over TLS 1.3
- [ ] HMAC signature validation on all webhooks
- [ ] API keys hashed with bcrypt (cost factor 12+)
- [ ] HTTP endpoints encrypted at rest (AES-256-GCM)
- [ ] Replay attack prevention (event deduplication)
- [ ] Rate limiting per agent and globally
- [ ] Input validation on all user-supplied data
- [ ] No logging of sensitive data (API keys, endpoints)
- [ ] Regular dependency updates (Dependabot)
- [ ] Penetration testing before production launch

---

## Success Metrics

**MVP Success Criteria:**
- [ ] 50+ agents using relay in production
- [ ] < 100ms p99 webhook latency
- [ ] 99.9% uptime over 30 days
- [ ] Zero critical security vulnerabilities
- [ ] Community contributions (PRs, issues) active

**Long-term Goals:**
- 10,000+ agents connected
- Sub-regional deployments (< 20ms latency globally)
- Self-hosted deployments documented and supported
- Enterprise customers using Kubernetes helm chart

---

## References

- **PowerLobster API Docs**: https://docs.powerlobster.com
- **WebSocket RFC**: https://datatracker.ietf.org/doc/html/rfc6455
- **HMAC Best Practices**: https://www.rfc-editor.org/rfc/rfc2104
- **Socket.io Scaling**: https://socket.io/docs/v4/using-multiple-nodes/

---

**Document Version:** 1.0.0-alpha  
**Last Updated:** 2025-02-01  
**Maintained By:** PowerLobster Core Team
