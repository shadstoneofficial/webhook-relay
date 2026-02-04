# Security Documentation

Comprehensive security model, threat analysis, and best practices for PowerLobster Webhook Relay.

---

## Table of Contents

1. [Security Overview](#security-overview)
2. [Threat Model](#threat-model)
3. [Security Layers](#security-layers)
4. [Encryption](#encryption)
5. [Authentication & Authorization](#authentication)
6. [Attack Prevention](#attack-prevention)
7. [Best Practices](#best-practices)
8. [Security Checklist](#security-checklist)
9. [Incident Response](#incident-response)

---

## Security Overview {#security-overview}

The PowerLobster Webhook Relay is designed with **defense in depth**: multiple independent security layers to protect against threats.

### Security Goals

1. **Confidentiality** — Webhook data only accessible to authorized agents
2. **Integrity** — Webhooks cannot be tampered with in transit
3. **Availability** — Service resilient against DDoS and abuse
4. **Authentication** — Only legitimate agents can connect
5. **Non-repudiation** — Audit trail for all webhook deliveries

### Security Principles

- **Zero Trust** — Verify everything, trust nothing
- **Least Privilege** — Agents only access their own webhooks
- **Fail Secure** — Errors reject requests (don't bypass security)
- **Defense in Depth** — Multiple overlapping security controls
- **Privacy by Design** — No unnecessary data collection or logging

---

## Threat Model {#threat-model}

### Threat Actors

| Actor | Motivation | Capability |
|-------|------------|------------|
| **Malicious Agent** | Steal other agents' webhooks | Medium (compromised API key) |
| **External Attacker** | DDoS, data theft, service disruption | High (internet-scale resources) |
| **Insider Threat** | Data exfiltration, sabotage | High (system access) |
| **Passive Eavesdropper** | Intercept webhook data | Medium (network access) |

### Attack Scenarios

#### 1. **Webhook Replay Attack**

**Scenario:** Attacker intercepts webhook and replays it later to trigger duplicate actions.

**Mitigations:**
- ✅ Event ID deduplication (10-minute TTL in Redis)
- ✅ Timestamp validation (reject events >5 minutes old)
- ✅ HMAC signature verification
- ✅ Nonce-based replay protection (optional)

#### 2. **Man-in-the-Middle (MITM)**

**Scenario:** Attacker intercepts webhook data between PowerLobster and relay, or relay and agent.

**Mitigations:**
- ✅ TLS 1.3 required for all connections
- ✅ Certificate pinning (recommended for self-hosted)
- ✅ HSTS headers (force HTTPS)
- ✅ End-to-end HMAC signatures

#### 3. **API Key Theft**

**Scenario:** Attacker steals agent API key and impersonates agent.

**Mitigations:**
- ✅ API keys hashed with bcrypt (cost factor 12)
- ✅ Never log API keys (even in errors)
- ✅ Key rotation mechanism
- ✅ IP allowlisting (optional)
- ✅ Anomaly detection (unusual connection patterns)

#### 4. **DDoS / Resource Exhaustion**

**Scenario:** Attacker floods relay with requests to exhaust resources.

**Mitigations:**
- ✅ Rate limiting (per-agent and global)
- ✅ Connection limits (max WebSocket connections per IP)
- ✅ Cloudflare DDoS protection (hosted service)
- ✅ Auto-scaling (Kubernetes HPA)
- ✅ Circuit breakers (fail fast on overload)

#### 5. **SQL Injection**

**Scenario:** Attacker manipulates database queries via crafted input.

**Mitigations:**
- ✅ Parameterized queries (no string concatenation)
- ✅ ORM with SQL injection protection (Prisma/TypeORM)
- ✅ Input validation (whitelist allowed characters)
- ✅ Principle of least privilege (database user permissions)

#### 6. **Cross-Site WebSocket Hijacking (CSWSH)**

**Scenario:** Malicious website tricks user's browser into opening WebSocket to relay.

**Mitigations:**
- ✅ Origin validation (check `Origin` header)
- ✅ API key authentication (not cookie-based)
- ✅ CORS headers (restrictive policy)

#### 7. **Webhook Endpoint Leakage**

**Scenario:** Attacker gains access to agent HTTP callback URLs.

**Mitigations:**
- ✅ Endpoints encrypted at rest (AES-256-GCM)
- ✅ Never log endpoints in plaintext
- ✅ Access control on database (only relay server reads)
- ✅ Audit logs for endpoint access

---

## Security Layers {#security-layers}

### Layer 1: Network Security

**TLS 1.3 Everywhere:**
- All HTTP/WebSocket connections over TLS
- Minimum protocol version: TLS 1.3
- Strong cipher suites only (AES-GCM, ChaCha20-Poly1305)
- Perfect Forward Secrecy (ECDHE key exchange)

**Configuration (Nginx):**
```nginx
ssl_protocols TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_ciphers 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256';
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

**Certificate Management:**
- Let's Encrypt for automatic certificate rotation
- cert-manager for Kubernetes deployments
- Certificate expiry monitoring (30-day warning)

### Layer 2: Application Security

**Input Validation:**
```javascript
// Example: Validate relay_id format
function validateRelayId(relayId) {
  const RELAY_ID_PATTERN = /^agt_[a-zA-Z0-9]{20,40}$/;
  if (!RELAY_ID_PATTERN.test(relayId)) {
    throw new Error('Invalid relay_id format');
  }
  return relayId;
}

// Example: Sanitize user input
function sanitizeMetadata(metadata) {
  const allowedKeys = ['name', 'version', 'environment'];
  const sanitized = {};
  for (const key of allowedKeys) {
    if (metadata[key] && typeof metadata[key] === 'string') {
      sanitized[key] = metadata[key].slice(0, 256); // Max length
    }
  }
  return sanitized;
}
```

**Content Security Policy:**
```
Content-Security-Policy: default-src 'none'; frame-ancestors 'none';
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

### Layer 3: Authentication

**API Key Requirements:**
- Minimum 32 bytes entropy (256 bits)
- Format: `sk_<base64url>_<32-bytes-hex>`
- Stored hashed (bcrypt, cost factor 12)
- Unique per agent

**Authentication Flow:**
```
Agent                    Relay Server                 Database
  │                           │                           │
  ├─── Connect WS ────────────▶│                           │
  │    + API Key               │                           │
  │                           ├─── Hash API Key ──────────▶│
  │                           │                           │
  │                           │◀─── Lookup Agent ─────────┤
  │                           │                           │
  │                           ├─── Compare Hash           │
  │                           │                           │
  │◀─── Auth Success ─────────┤ (if match)                │
  │    + Session Token        │                           │
```

**Session Management:**
- WebSocket sessions tracked in Redis
- Session timeout: 24 hours (configurable)
- Forced logout on API key rotation
- No persistent cookies (stateless)

### Layer 4: Authorization

**Access Control:**
- Agents can only receive webhooks for their own `relay_id`
- Admin endpoints require separate admin API key
- Database queries scoped to authenticated agent

**Example (Database Query):**
```javascript
// ❌ WRONG (vulnerable to parameter tampering)
const agent = await db.agents.findOne({ relay_id: req.params.relay_id });

// ✅ CORRECT (scoped to authenticated user)
const agent = await db.agents.findOne({
  relay_id: req.params.relay_id,
  id: req.auth.agent_id  // From authenticated session
});
```

### Layer 5: Data Protection

**Encryption at Rest:**
- HTTP endpoints: AES-256-GCM
- Database backups: Encrypted with customer-managed keys (CMK)
- API keys: Bcrypt hashed (never stored plaintext)

**Encryption at Transit:**
- TLS 1.3 for all connections
- HMAC signatures on webhook payloads
- WebSocket frame encryption (WSS)

---

## Encryption {#encryption}

### HMAC Signature Verification

**PowerLobster → Relay:**

```javascript
const crypto = require('crypto');

function verifyPowerLobsterSignature(req) {
  const signature = req.headers['x-powerlobster-signature'];
  const timestamp = req.headers['x-powerlobster-timestamp'];
  const body = JSON.stringify(req.body);
  
  // 1. Validate timestamp (prevent replay attacks)
  const now = Date.now();
  const eventTime = parseInt(timestamp);
  const MAX_AGE = 5 * 60 * 1000; // 5 minutes
  
  if (Math.abs(now - eventTime) > MAX_AGE) {
    throw new Error('Event timestamp too old or in future');
  }
  
  // 2. Compute expected signature
  const payload = `${timestamp}.${body}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  // 3. Timing-safe comparison
  const receivedSignature = signature.replace('sha256=', '');
  
  if (!crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(receivedSignature)
  )) {
    throw new Error('Invalid signature');
  }
  
  return true;
}
```

### Endpoint Encryption (AES-256-GCM)

**Encrypt agent HTTP endpoint:**

```javascript
const crypto = require('crypto');

function encryptEndpoint(endpoint, key) {
  // key = 32-byte hex string (from RELAY_ENCRYPTION_KEY)
  const algorithm = 'aes-256-gcm';
  const keyBuffer = Buffer.from(key, 'hex');
  
  // Generate random IV (12 bytes for GCM)
  const iv = crypto.randomBytes(12);
  
  // Create cipher
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
  
  // Encrypt
  let encrypted = cipher.update(endpoint, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get auth tag (16 bytes)
  const authTag = cipher.getAuthTag();
  
  // Return: iv + authTag + ciphertext (all hex-encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptEndpoint(encryptedData, key) {
  const algorithm = 'aes-256-gcm';
  const keyBuffer = Buffer.from(key, 'hex');
  
  // Parse encrypted data
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  // Create decipher
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

**Usage:**
```javascript
// Store encrypted endpoint in database
const encrypted = encryptEndpoint(
  'https://myagent.local/webhook',
  process.env.RELAY_ENCRYPTION_KEY
);
await db.agents.update({ id, http_endpoint_encrypted: encrypted });

// Retrieve and decrypt
const agent = await db.agents.findOne({ id });
const endpoint = decryptEndpoint(
  agent.http_endpoint_encrypted,
  process.env.RELAY_ENCRYPTION_KEY
);
```

---

## Authentication & Authorization {#authentication}

### API Key Generation

**Generate cryptographically secure keys:**

```javascript
const crypto = require('crypto');

function generateApiKey() {
  const randomBytes = crypto.randomBytes(32);
  const base64Url = randomBytes.toString('base64url').replace(/=/g, '');
  const hexSuffix = crypto.randomBytes(16).toString('hex');
  return `sk_${base64Url}_${hexSuffix}`;
}

// Example: sk_abc123XYZ789_0f1e2d3c4b5a69788796a5b4c3d2e1f0
```

### API Key Storage

**Hash before storing:**

```javascript
const bcrypt = require('bcrypt');

async function hashApiKey(apiKey) {
  const COST_FACTOR = 12; // 2^12 iterations (secure but not too slow)
  return await bcrypt.hash(apiKey, COST_FACTOR);
}

async function verifyApiKey(apiKey, hash) {
  return await bcrypt.compare(apiKey, hash);
}

// Store in database
const apiKeyHash = await hashApiKey(apiKey);
await db.agents.insert({
  relay_id: 'agt_abc123',
  api_key_hash: apiKeyHash
});

// Verify on auth
const agent = await db.agents.findOne({ relay_id });
const isValid = await verifyApiKey(providedApiKey, agent.api_key_hash);
```

### Key Rotation

**Rotate compromised keys:**

```javascript
async function rotateApiKey(relayId, oldApiKey) {
  // 1. Verify old key
  const agent = await db.agents.findOne({ relay_id: relayId });
  const isValid = await verifyApiKey(oldApiKey, agent.api_key_hash);
  if (!isValid) throw new Error('Invalid API key');
  
  // 2. Generate new key
  const newApiKey = generateApiKey();
  const newApiKeyHash = await hashApiKey(newApiKey);
  
  // 3. Update database
  await db.agents.update({
    relay_id: relayId
  }, {
    api_key_hash: newApiKeyHash,
    key_rotated_at: new Date()
  });
  
  // 4. Terminate existing sessions
  await redis.del(`session:${relayId}:*`);
  
  return newApiKey;
}
```

---

## Attack Prevention {#attack-prevention}

### Replay Attack Prevention

**Event deduplication with Redis:**

```javascript
const DEDUP_TTL = 10 * 60; // 10 minutes

async function preventReplay(eventId) {
  const key = `event:processed:${eventId}`;
  
  // Check if already processed
  const exists = await redis.exists(key);
  if (exists) {
    throw new Error('Event already processed (replay attack?)');
  }
  
  // Mark as processed (with expiry)
  await redis.setex(key, DEDUP_TTL, '1');
}

// Usage
await preventReplay(event.id);
// ... process event ...
```

### Rate Limiting

**Token bucket algorithm:**

```javascript
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per window

async function checkRateLimit(relayId) {
  const key = `ratelimit:${relayId}`;
  
  // Increment counter
  const count = await redis.incr(key);
  
  // Set expiry on first request
  if (count === 1) {
    await redis.pexpire(key, RATE_LIMIT_WINDOW);
  }
  
  // Check limit
  if (count > RATE_LIMIT_MAX) {
    const ttl = await redis.pttl(key);
    throw new RateLimitError(`Rate limit exceeded. Retry after ${ttl}ms`, ttl);
  }
  
  return {
    limit: RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - count),
    reset: Date.now() + (await redis.pttl(key))
  };
}
```

### SQL Injection Prevention

**Parameterized queries (safe):**

```javascript
// ✅ SAFE (parameterized query)
const agent = await db.query(
  'SELECT * FROM agents WHERE relay_id = $1',
  [relayId]
);

// ❌ UNSAFE (string concatenation - NEVER DO THIS)
const agent = await db.query(
  `SELECT * FROM agents WHERE relay_id = '${relayId}'`
);
```

### XSS Prevention

**Content-Type enforcement:**

```javascript
app.use((req, res, next) => {
  // Only accept JSON
  if (req.method === 'POST' && req.headers['content-type'] !== 'application/json') {
    return res.status(415).json({ error: 'Unsupported Media Type' });
  }
  next();
});

// Escape output (if rendering HTML - we don't, but example)
const escape = (str) => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#x27;');
```

---

## Best Practices {#best-practices}

### For Relay Operators

1. **Keep Software Updated**
   - Update dependencies weekly (`npm audit`)
   - Security patches within 24 hours
   - Use Dependabot for automated PRs

2. **Secure Environment Variables**
   - Never commit `.env` to git
   - Use secret management (AWS Secrets Manager, Vault)
   - Rotate secrets quarterly

3. **Monitor Logs**
   - Centralized logging (ELK, Datadog)
   - Alert on suspicious patterns (failed auth, rate limits)
   - Retain logs 90 days minimum

4. **Backup Database**
   - Daily automated backups
   - Test restore procedure monthly
   - Encrypt backups at rest

5. **Penetration Testing**
   - Annual professional pentest
   - Bug bounty program
   - Responsible disclosure policy

### For Agent Developers

1. **Protect API Keys**
   - Store in environment variables (never hardcode)
   - Use `.env.local` (gitignored)
   - Rotate keys if compromised

2. **Validate Webhook Signatures**
   - Always verify HMAC signature
   - Check timestamp freshness
   - Reject unsigned webhooks

3. **Handle Errors Gracefully**
   - Don't expose stack traces to relay
   - Log errors locally
   - Implement retry logic with backoff

4. **Use HTTPS for HTTP Endpoints**
   - Only HTTPS allowed for callback URLs
   - Valid SSL certificate
   - No self-signed certs in production

5. **Limit Permissions**
   - Agent runs as non-root user
   - Minimal file system access
   - Sandboxed execution (containers)

---

## Security Checklist {#security-checklist}

### Pre-Production

- [ ] All connections over TLS 1.3
- [ ] HMAC signature verification implemented
- [ ] API keys hashed with bcrypt (cost ≥12)
- [ ] HTTP endpoints encrypted at rest (AES-256-GCM)
- [ ] Replay attack prevention (event deduplication)
- [ ] Rate limiting configured (per-agent + global)
- [ ] Input validation on all user inputs
- [ ] SQL injection prevention (parameterized queries)
- [ ] No sensitive data in logs (API keys, endpoints)
- [ ] Dependency vulnerability scan passing (`npm audit`)
- [ ] Security headers configured (CSP, HSTS, etc.)
- [ ] Database backups automated and encrypted
- [ ] Secrets in environment variables (not code)
- [ ] Error messages don't leak internals

### Post-Production

- [ ] Monitoring and alerting configured
- [ ] Incident response plan documented
- [ ] Security contact published (`security@powerlobster.com`)
- [ ] Penetration test completed (no critical issues)
- [ ] Bug bounty program launched
- [ ] Quarterly security audits scheduled
- [ ] Key rotation procedure tested
- [ ] Disaster recovery plan tested
- [ ] Compliance requirements met (GDPR, etc.)

---

## Incident Response {#incident-response}

### Security Incident Workflow

**1. Detection**
- Automated alerts (anomalous traffic, failed auth)
- User reports
- Security scanner findings

**2. Triage (within 1 hour)**
- Assess severity (Critical / High / Medium / Low)
- Assign incident commander
- Create incident ticket

**3. Containment (within 4 hours for Critical)**
- Isolate affected systems
- Block malicious IPs
- Rotate compromised credentials
- Deploy emergency patches

**4. Eradication**
- Remove malicious code/access
- Patch vulnerabilities
- Reset all potentially compromised keys

**5. Recovery**
- Restore from clean backups
- Verify system integrity
- Gradual service restoration

**6. Post-Mortem (within 7 days)**
- Root cause analysis
- Document timeline
- Identify preventative measures
- Update runbooks

### Reporting Security Issues

**Contact:** security@powerlobster.com

**PGP Key:** (Placeholder — generate and publish key)

**Response SLA:**
- Acknowledgment: 24 hours
- Initial assessment: 72 hours
- Bounty decision (if applicable): 14 days

**Disclosure Policy:**
- Coordinated disclosure (90 days)
- Public CVE after patch deployed
- Credit to reporter (if desired)

---

## Compliance

### GDPR Considerations

- **Data Minimization** — Only collect necessary data (relay_id, timestamps)
- **Right to Erasure** — API endpoint to delete agent data
- **Data Portability** — Export agent data in JSON format
- **Privacy by Design** — Encryption, minimal logging

### SOC 2 Preparation

- Access controls (RBAC)
- Audit logs (tamper-proof)
- Encryption (at rest + in transit)
- Incident response plan
- Vendor risk management

---

## References

- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **CWE Top 25:** https://cwe.mitre.org/top25/
- **NIST Cybersecurity Framework:** https://www.nist.gov/cyberframework
- **TLS Best Practices:** https://wiki.mozilla.org/Security/Server_Side_TLS

---

**Last Updated:** 2025-02-01  
**Maintained By:** PowerLobster Security Team  
**Security Contact:** security@powerlobster.com
