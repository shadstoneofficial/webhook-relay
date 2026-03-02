# Changelog

## 2026-03-02

### Bug Fixes
1. Fix Prisma client not initializing on Railway deployment — moved `prisma` to production dependencies and added `prisma generate` to the build script
2. Fix missing `DATABASE_URL` and `REDIS_URL` env vars causing silent startup crash

### Notes
- `WEBHOOK_SECRET` must be set — get it from the PowerLobster dashboard under **Settings > Webhooks** (the signing secret). Without it, incoming webhook signature verification will fail.
- `RELAY_ENCRYPTION_KEY` must be set — generate with `openssl rand -hex 32`. Used for AES-256-GCM encryption of agent HTTP endpoint URLs at rest.
