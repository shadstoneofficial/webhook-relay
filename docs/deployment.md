# Deployment Guide

This guide covers deploying the PowerLobster Webhook Relay in various environments.

---

## Table of Contents

1. [Docker Compose (Local/Development)](#docker-compose)
2. [Docker Compose (Production)](#docker-compose-production)
3. [Kubernetes (Helm Chart)](#kubernetes)
4. [Manual Installation](#manual-installation)
5. [Cloud Platform Guides](#cloud-platforms)
6. [Configuration Reference](#configuration-reference)

---

## Docker Compose (Local/Development) {#docker-compose}

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum

### Quick Start

**1. Clone and configure:**
```bash
git clone https://github.com/powerlobster-hq/webhook-relay.git
cd webhook-relay
cp .env.example .env
```

**2. Edit `.env`:**
```bash
# Required
WEBHOOK_SECRET=your-powerlobster-webhook-secret
RELAY_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Optional (defaults shown)
PORT=3000
NODE_ENV=development
REDIS_URL=redis://redis:6379
DATABASE_URL=postgresql://postgres:devpassword@db:5432/relay
```

**3. Start services:**
```bash
docker-compose up -d
```

**4. Verify:**
```bash
curl http://localhost:3000/api/v1/health
# Expected: {"status":"healthy","version":"1.0.0"}
```

**5. View logs:**
```bash
docker-compose logs -f relay
```

---

## Docker Compose (Production) {#docker-compose-production}

### Prerequisites
- Ubuntu 22.04 LTS (or similar) with Docker installed
- Domain name pointed to your server (e.g., `relay.yourdomain.com`)
- At least 4GB RAM, 2 vCPU, 20GB storage

### Production Setup

**1. Clone and configure:**
```bash
git clone https://github.com/powerlobster-hq/webhook-relay.git
cd webhook-relay
cp .env.example .env
nano .env  # Edit production values
```

**2. Production `.env`:**
```bash
# Server
NODE_ENV=production
PORT=3000
DOMAIN=relay.yourdomain.com

# Security (CRITICAL: Change these!)
WEBHOOK_SECRET=<get-from-powerlobster-webhook-settings>
RELAY_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Database
POSTGRES_PASSWORD=$(openssl rand -base64 32)
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/relay

# Redis
REDIS_URL=redis://redis:6379

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# WebSocket
WS_HEARTBEAT_INTERVAL=30000
WS_CONNECTION_TIMEOUT=60000
```

**3. Use production compose file:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

**`docker-compose.prod.yml` example:**
```yaml
version: '3.8'

services:
  relay:
    image: powerlobster/webhook-relay:latest
    restart: always
    environment:
      - NODE_ENV=production
      - PORT=${PORT:-3000}
      - WEBHOOK_SECRET=${WEBHOOK_SECRET}
      - RELAY_ENCRYPTION_KEY=${RELAY_ENCRYPTION_KEY}
      - REDIS_URL=${REDIS_URL}
      - DATABASE_URL=${DATABASE_URL}
      - RATE_LIMIT_WINDOW_MS=${RATE_LIMIT_WINDOW_MS}
      - RATE_LIMIT_MAX_REQUESTS=${RATE_LIMIT_MAX_REQUESTS}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - relay-network

  db:
    image: postgres:15-alpine
    restart: always
    environment:
      - POSTGRES_DB=relay
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - relay-network

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    networks:
      - relay-network

  caddy:
    image: caddy:2-alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
    networks:
      - relay-network
    depends_on:
      - relay

volumes:
  pg-data:
  redis-data:
  caddy-data:
  caddy-config:

networks:
  relay-network:
    driver: bridge
```

**4. Configure Caddy (automatic HTTPS):**

**`Caddyfile`:**
```
{$DOMAIN} {
    reverse_proxy relay:3000 {
        header_up X-Forwarded-For {remote_host}
        header_up X-Real-IP {remote_host}
    }
    
    encode gzip
    
    log {
        output file /var/log/caddy/access.log
        format json
    }
}
```

**5. Start and verify:**
```bash
docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml logs -f

# Wait for Caddy to obtain SSL certificate (1-2 minutes)
curl https://relay.yourdomain.com/api/v1/health
```

**6. Database migrations:**
```bash
docker-compose -f docker-compose.prod.yml exec relay npm run db:migrate
```

### Monitoring

**Check service status:**
```bash
docker-compose -f docker-compose.prod.yml ps
```

**View logs:**
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f relay
```

**Restart services:**
```bash
docker-compose -f docker-compose.prod.yml restart relay
```

### Backup

**Database backup:**
```bash
# Backup
docker-compose -f docker-compose.prod.yml exec db pg_dump -U postgres relay > backup-$(date +%F).sql

# Restore
cat backup-2025-02-01.sql | docker-compose -f docker-compose.prod.yml exec -T db psql -U postgres relay
```

**Redis backup (optional):**
```bash
docker-compose -f docker-compose.prod.yml exec redis redis-cli SAVE
docker cp $(docker-compose ps -q redis):/data/dump.rdb ./redis-backup-$(date +%F).rdb
```

---

## Kubernetes (Helm Chart) {#kubernetes}

### Prerequisites
- Kubernetes 1.24+
- Helm 3.0+
- Cluster with at least 4GB RAM, 2 vCPU available
- Ingress controller installed (nginx, traefik, etc.)
- cert-manager for automatic TLS (recommended)

### Install Helm Chart

**1. Add PowerLobster Helm repository:**
```bash
helm repo add powerlobster https://charts.powerlobster.com
helm repo update
```

**2. Create namespace:**
```bash
kubectl create namespace webhook-relay
```

**3. Create secrets:**
```bash
# Generate encryption key
RELAY_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Create secret
kubectl create secret generic relay-secrets \
  --from-literal=webhook-secret=<your-powerlobster-webhook-secret> \
  --from-literal=relay-encryption-key=$RELAY_ENCRYPTION_KEY \
  --namespace=webhook-relay
```

**4. Install chart:**
```bash
helm install webhook-relay powerlobster/webhook-relay \
  --namespace=webhook-relay \
  --set ingress.enabled=true \
  --set ingress.hostname=relay.yourdomain.com \
  --set ingress.tls.enabled=true \
  --set replicaCount=2 \
  --set redis.enabled=true \
  --set postgresql.enabled=true
```

**5. Verify installation:**
```bash
kubectl get pods -n webhook-relay
kubectl get ingress -n webhook-relay
```

### Helm Values Reference

**`values.yaml` (minimal):**
```yaml
replicaCount: 2

image:
  repository: powerlobster/webhook-relay
  tag: "1.0.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 3000

ingress:
  enabled: true
  className: nginx
  hostname: relay.yourdomain.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    enabled: true
    secretName: relay-tls

env:
  NODE_ENV: production
  RATE_LIMIT_WINDOW_MS: "60000"
  RATE_LIMIT_MAX_REQUESTS: "100"

secrets:
  existingSecret: relay-secrets

redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: false

postgresql:
  enabled: true
  auth:
    database: relay
    username: relay
    existingSecret: relay-secrets

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80
```

**Install with custom values:**
```bash
helm install webhook-relay powerlobster/webhook-relay \
  --namespace=webhook-relay \
  -f values.yaml
```

### Upgrading

```bash
helm upgrade webhook-relay powerlobster/webhook-relay \
  --namespace=webhook-relay \
  -f values.yaml
```

### Uninstalling

```bash
helm uninstall webhook-relay --namespace=webhook-relay
```

---

## Manual Installation {#manual-installation}

For advanced users who want full control.

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Nginx or Caddy (reverse proxy)
- PM2 or systemd (process manager)

### Steps

**1. Install dependencies:**
```bash
# Clone repo
git clone https://github.com/powerlobster-hq/webhook-relay.git
cd webhook-relay/packages/relay-server

# Install
npm install --production
```

**2. Configure environment:**
```bash
cp .env.example .env
nano .env  # Edit values
```

**3. Database setup:**
```bash
# Create database
createdb relay

# Run migrations
npm run db:migrate
```

**4. Start with PM2:**
```bash
# Install PM2
npm install -g pm2

# Start relay
pm2 start npm --name "webhook-relay" -- start

# Save PM2 config
pm2 save

# Auto-start on boot
pm2 startup
```

**5. Configure Nginx:**

**`/etc/nginx/sites-available/relay`:**
```nginx
upstream relay_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name relay.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name relay.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/relay.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://relay_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

**Enable and test:**
```bash
sudo ln -s /etc/nginx/sites-available/relay /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Cloud Platform Guides {#cloud-platforms}

### AWS (ECS Fargate)

**1. Build and push Docker image:**
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker build -t webhook-relay .
docker tag webhook-relay:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/webhook-relay:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/webhook-relay:latest
```

**2. Create ECS task definition (JSON):**
```json
{
  "family": "webhook-relay",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "relay",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/webhook-relay:latest",
      "portMappings": [{"containerPort": 3000, "protocol": "tcp"}],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "3000"}
      ],
      "secrets": [
        {"name": "WEBHOOK_SECRET", "valueFrom": "arn:aws:secretsmanager:..."},
        {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:..."}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/webhook-relay",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "relay"
        }
      }
    }
  ]
}
```

**3. Create ECS service with ALB for load balancing.**

### Google Cloud Run

**1. Deploy from source:**
```bash
gcloud run deploy webhook-relay \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "WEBHOOK_SECRET=webhook-secret:latest,DATABASE_URL=database-url:latest"
```

**2. Connect to Cloud SQL (PostgreSQL) and Memorystore (Redis).**

### Heroku

**1. Create app:**
```bash
heroku create webhook-relay-prod
```

**2. Add addons:**
```bash
heroku addons:create heroku-postgresql:mini
heroku addons:create heroku-redis:mini
```

**3. Configure:**
```bash
heroku config:set WEBHOOK_SECRET=<your-secret>
heroku config:set RELAY_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

**4. Deploy:**
```bash
git push heroku main
```

---

## Configuration Reference {#configuration-reference}

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment (`development`, `production`) |
| `PORT` | No | `3000` | HTTP server port |
| `WEBHOOK_SECRET` | **Yes** | — | HMAC secret from PowerLobster |
| `RELAY_ENCRYPTION_KEY` | **Yes** | — | 32-byte hex key for encrypting endpoints |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `REDIS_URL` | **Yes** | — | Redis connection string |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window (milliseconds) |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Max requests per window per agent |
| `WS_HEARTBEAT_INTERVAL` | No | `30000` | WebSocket ping interval (milliseconds) |
| `WS_CONNECTION_TIMEOUT` | No | `60000` | WebSocket idle timeout (milliseconds) |
| `LOG_LEVEL` | No | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `SENTRY_DSN` | No | — | Sentry error tracking DSN (optional) |

### Database Schema

**Run migrations:**
```bash
npm run db:migrate
```

**Rollback:**
```bash
npm run db:rollback
```

---

## Troubleshooting

### Health Check Failing

**Check logs:**
```bash
docker-compose logs relay
```

**Common issues:**
- Database not ready (wait 30s for initial startup)
- Redis connection failed (check `REDIS_URL`)
- Missing environment variables

### WebSocket Connection Issues

**Test WebSocket endpoint:**
```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c wss://relay.yourdomain.com/api/v1/connect
```

**Common issues:**
- Firewall blocking WebSocket traffic (ensure port 443 open)
- Reverse proxy not forwarding `Upgrade` header (check nginx/caddy config)
- SSL certificate invalid (check with `curl -v`)

### Performance Issues

**Monitor metrics:**
```bash
# CPU and memory
docker stats

# Database connections
docker-compose exec db psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Redis memory
docker-compose exec redis redis-cli INFO memory
```

**Optimize:**
- Increase `replicaCount` for horizontal scaling
- Add Redis cluster for distributed caching
- Use PostgreSQL read replicas for heavy read loads

---

## Support

- **Documentation:** https://docs.powerlobster.com/webhook-relay
- **GitHub Issues:** https://github.com/powerlobster-hq/webhook-relay/issues
- **Discord:** https://discord.gg/powerlobster
