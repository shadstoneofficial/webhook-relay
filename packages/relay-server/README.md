# Relay Server

PowerLobster Webhook Relay backend service (Node.js/TypeScript).

## Structure

```
relay-server/
├── src/
│   ├── index.ts                 # Application entry point
│   ├── server.ts                # HTTP/WebSocket server setup
│   ├── config/
│   │   └── env.ts               # Environment configuration
│   ├── routes/
│   │   ├── webhook.ts           # POST /webhook/:relay_id
│   │   ├── register.ts          # POST /register
│   │   ├── health.ts            # GET /health
│   │   └── stats.ts             # GET /stats (admin)
│   ├── websocket/
│   │   ├── manager.ts           # WebSocket connection manager
│   │   ├── protocol.ts          # Message type definitions
│   │   └── heartbeat.ts         # Ping/pong keep-alive
│   ├── services/
│   │   ├── auth.ts              # API key authentication
│   │   ├── signature.ts         # HMAC signature verification
│   │   ├── encryption.ts        # AES-256-GCM for endpoints
│   │   ├── ratelimit.ts         # Rate limiting (Redis)
│   │   └── replay.ts            # Replay attack prevention
│   ├── database/
│   │   ├── client.ts            # PostgreSQL connection
│   │   ├── migrations/          # Database schema migrations
│   │   └── models/
│   │       └── agent.ts         # Agent data model
│   ├── redis/
│   │   └── client.ts            # Redis connection + helpers
│   ├── middleware/
│   │   ├── error.ts             # Global error handler
│   │   ├── logger.ts            # Request logging
│   │   └── security.ts          # Security headers
│   └── utils/
│       ├── logger.ts            # Winston logger setup
│       └── crypto.ts            # Cryptographic utilities
├── tests/
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   └── e2e/                     # End-to-end tests
├── package.json
├── tsconfig.json
├── Dockerfile
└── .env.example
```

## Technology Stack

- **Runtime:** Node.js 18+ (TypeScript)
- **Web Framework:** Fastify (high performance) or Express (simplicity)
- **WebSocket:** ws library or Socket.io
- **Database:** PostgreSQL 15+ (via Prisma or pg)
- **Cache/Queue:** Redis 7+ (via ioredis)
- **Logging:** Winston or Pino
- **Testing:** Jest + Supertest

## Installation

```bash
# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

See `.env.example` for full list.

Required:
```bash
NODE_ENV=production
PORT=3000
WEBHOOK_SECRET=your-powerlobster-webhook-secret
RELAY_ENCRYPTION_KEY=$(openssl rand -hex 32)
DATABASE_URL=postgresql://user:pass@localhost/relay
REDIS_URL=redis://localhost:6379
```

## API Reference

See [docs/api-reference.md](../../docs/api-reference.md)

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format
```

## Deployment

See [docs/deployment.md](../../docs/deployment.md)
