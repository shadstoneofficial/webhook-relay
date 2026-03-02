# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Rules

### Model Requirement
- Always use the latest version of Claude Opus for tasks in this project.
- Exception: use the latest version of Claude Sonnet for mockups or documentation.
- Do not fall back to Haiku unless explicitly instructed.

### Verify Before You Claim
- Always verify every claim against actual code. No assumptions, no guessing, no hallucination.
- Read relevant files before providing proposals or fixes.

### Git Rules
- You may only `git commit`. **Never `git push`.**
- The developer is the only one who pushes to the repository.

### Research Before Implementation
- When asked to research/investigate, do only that — gather findings, propose solutions, **do not write or modify code**.
- Wait for explicit go signal ("go ahead," "proceed," "let's do it") before implementing.
- If instructions are ambiguous, ask for clarification.

### Changelog Management
- Maintain `CHANGELOG.md` at project root.
- Update changelog **in the same commit** as the code changes (not separate).
- Format:
```markdown
## YYYY-MM-DD

### Bug Fixes
1. Description

### Features
1. Description
```
- Group entries under correct date heading. Be specific — reference affected component/module.

---

## Build & Dev Commands

This is an npm workspaces monorepo (`packages/*`, `examples/*`).

```bash
# Install all dependencies
npm install

# Build all packages
npm run build

# Run all tests
npm test
```

### Relay Server (`packages/relay-server`)
```bash
npm run dev              # Dev mode (ts-node-dev with auto-reload)
npm run build            # TypeScript compile to dist/
npm start                # Run compiled dist/index.js
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run Prisma migrations
```

### Node SDK (`packages/node-sdk`)
```bash
npm test                 # Jest
npm run test:watch       # Jest watch mode
npm run lint             # ESLint
npm run format           # Prettier
```

### Python SDK (`packages/python-sdk`)
```bash
pip install -e .         # Install in dev mode
pytest                   # Run tests
pytest --cov             # With coverage
```

### Docker (local dev)
```bash
docker-compose up -d     # Start relay + Redis + Postgres
docker-compose down      # Stop
```

---

## Architecture

**PowerLobster Webhook Relay** — enables agents to receive real-time webhooks without a public IP. PowerLobster sends webhooks to the relay server, which forwards them to agents via WebSocket.

### Monorepo Packages

| Package | Tech | Purpose |
|---------|------|---------|
| `packages/relay-server` | Fastify + TypeScript | Webhook receiver, WebSocket manager, agent registry |
| `packages/node-sdk` | TypeScript + `ws` | Client SDK published as `@powerlobster/webhook` |
| `packages/python-sdk` | Python + `websockets` | Client SDK published as `powerlobster-webhook` |

### Relay Server Internals

**Entry:** `src/index.ts` → connects DB + Redis, starts Fastify server via `src/server.ts`.

**Route registration** (`src/server.ts`): Fastify registers `@fastify/websocket`, applies security middleware as `onRequest` hook, registers route modules under `/api/v1` prefix, and mounts WebSocket endpoint at `/api/v1/connect`.

**Key routes:**
- `POST /api/v1/webhook/:relay_id` — receives webhooks from PowerLobster (HMAC verified)
- `WS /api/v1/connect` — agent WebSocket connections
- `POST /api/v1/register` — agent registration
- `GET /api/v1/health` — health check
- `GET /api/v1/stats` — metrics

**Webhook delivery pipeline** (`src/routes/webhook.ts`):
1. Verify HMAC signature (`X-PowerLobster-Signature` header)
2. Validate timestamp (reject >5min old)
3. Replay prevention via Redis event dedup
4. Rate limit check
5. Forward to agent via `WebSocketManager.sendWebhook()`
6. Returns 200 (delivered) or 202 (queued if agent offline)

**WebSocket protocol** (`src/websocket/manager.ts`):
- `WebSocketManager` holds in-memory `Map<relayId, AgentConnection>`
- Auth flow: client sends `{type: "auth", relay_id, api_key}` → server verifies against Prisma DB (bcrypt) → responds with `auth_success` + webhook URL
- Server pings every 30s, disconnects after 90s timeout
- Sessions stored in Redis for multi-instance routing
- Offline agents: events queued in Redis list `queue:pending:{relayId}`

**Services:**
- `services/auth.ts` — API key generation (`sk_` prefix), bcrypt hashing, agent lookup via Prisma
- `services/signature.ts` — HMAC-SHA256 verification
- `services/replay.ts` — event deduplication
- `services/ratelimit.ts` — per-agent rate limiting
- `services/encryption.ts` — AES-256-GCM for HTTP endpoint encryption at rest

**Infrastructure:**
- PostgreSQL via Prisma ORM (schema: `prisma/schema.prisma`) — `agents` and `webhook_events` tables
- Redis via `ioredis` — sessions, rate limits, pending queues, event dedup
- Logging: `pino` (pretty in dev, JSON in prod). Log level via `LOG_LEVEL` env var.
- Reverse proxy: Caddy (configured via `Caddyfile`, domain from `$DOMAIN` env var)

### SDK Architecture (Node + Python)

Both SDKs follow the same pattern:
- Connect via WebSocket → authenticate → receive events → auto-acknowledge
- Event-driven: `webhook`, `connected`, `disconnected`, `reconnecting`, `error`
- Auto-reconnect with exponential backoff
- Heartbeat monitoring (3x interval timeout)
- HTTP fallback mode via `handleHttpWebhook()`
- Webhook handlers return `false` to skip auto-ack (event will retry)

### Config (`src/config/env.ts`)

All config from env vars: `PORT`, `NODE_ENV`, `WEBHOOK_SECRET`, `RELAY_ENCRYPTION_KEY`, `REDIS_URL`, `DATABASE_URL`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `WS_HEARTBEAT_INTERVAL`, `WS_CONNECTION_TIMEOUT`, `PUBLIC_URL`.

---

## Coding Standards

**TypeScript:** strict mode, ES2020 target, CommonJS modules, 2-space indent, semicolons, single quotes, trailing commas. ESLint + Prettier.

**Python:** PEP 8, Black formatting, type hints required, Google-style docstrings.

**Commit messages:** `<type>(<scope>): <subject>` — types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
