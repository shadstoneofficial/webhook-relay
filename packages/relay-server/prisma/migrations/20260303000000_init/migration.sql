-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "relay_id" VARCHAR(64) NOT NULL,
    "api_key_hash" VARCHAR(128) NOT NULL,
    "workspace_id" VARCHAR(128),
    "connection_type" VARCHAR(16) NOT NULL DEFAULT 'websocket',
    "http_endpoint_encrypted" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(6),
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "relay_id" VARCHAR(64) NOT NULL,
    "event_id" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "attempts" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(6),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_relay_id_key" ON "agents"("relay_id");

-- CreateIndex
CREATE INDEX "agents_relay_id_idx" ON "agents"("relay_id");

-- CreateIndex
CREATE INDEX "agents_workspace_id_idx" ON "agents"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_event_id_key" ON "webhook_events"("event_id");

-- CreateIndex
CREATE INDEX "webhook_events_relay_id_idx" ON "webhook_events"("relay_id");

-- CreateIndex
CREATE INDEX "webhook_events_status_idx" ON "webhook_events"("status");
