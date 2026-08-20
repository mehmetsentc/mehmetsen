-- Phase 4D.3 — dedicated AI worker lease + durable draft snapshot (additive only)
-- Forbidden: DROP TABLE, TRUNCATE, destructive rewrites.

ALTER TABLE "crawler_ai_jobs"
  ADD COLUMN IF NOT EXISTS "lease_owner" varchar(80);--> statement-breakpoint
ALTER TABLE "crawler_ai_jobs"
  ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crawler_ai_jobs"
  ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crawler_ai_jobs"
  ADD COLUMN IF NOT EXISTS "execution_id" varchar(80);--> statement-breakpoint
ALTER TABLE "crawler_ai_jobs"
  ADD COLUMN IF NOT EXISTS "event_revision" varchar(64);--> statement-breakpoint
ALTER TABLE "crawler_ai_jobs"
  ADD COLUMN IF NOT EXISTS "failure_code" varchar(64);--> statement-breakpoint
ALTER TABLE "crawler_ai_jobs"
  ADD COLUMN IF NOT EXISTS "draft_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "crawler_ai_jobs"
  ADD COLUMN IF NOT EXISTS "validation_snapshot" jsonb;--> statement-breakpoint

-- Indexed claim queue: PENDING/RESERVED + expired PROCESSING leases
CREATE INDEX IF NOT EXISTS "crawler_ai_jobs_claim_queue_idx"
  ON "crawler_ai_jobs" USING btree ("status", "priority" DESC, "created_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_jobs_lease_expires_idx"
  ON "crawler_ai_jobs" USING btree ("lease_expires_at")
  WHERE "status" = 'PROCESSING';--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "crawler_ai_jobs_execution_uidx"
  ON "crawler_ai_jobs" ("execution_id")
  WHERE "execution_id" IS NOT NULL;
