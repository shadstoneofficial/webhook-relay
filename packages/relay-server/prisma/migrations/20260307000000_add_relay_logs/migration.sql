-- CreateTable
CREATE TABLE "relay_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "relay_id" VARCHAR(64) NOT NULL,
    "level" VARCHAR(16) NOT NULL,
    "event" VARCHAR(32) NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relay_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "relay_logs_relay_id_idx" ON "relay_logs"("relay_id");

-- CreateIndex
CREATE INDEX "relay_logs_created_at_idx" ON "relay_logs"("created_at");
