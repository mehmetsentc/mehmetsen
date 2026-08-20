-- Phase 4D — controlled auto-draft pipeline (additive only)
-- Forbidden: DROP TABLE, TRUNCATE, destructive rewrites.

ALTER TABLE "news_clusters"
  ADD COLUMN IF NOT EXISTS "content_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "news_clusters"
  ADD COLUMN IF NOT EXISTS "drafted_content_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "news_clusters"
  ADD COLUMN IF NOT EXISTS "auto_draft_status" varchar(32);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "news_clusters_auto_draft_status_idx"
  ON "news_clusters" USING btree ("auto_draft_status");--> statement-breakpoint

-- One active equivalent AI job per event (DB-level idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS "crawler_ai_jobs_cluster_active_uidx"
  ON "crawler_ai_jobs" ("cluster_id")
  WHERE "status" IN ('PENDING', 'RESERVED', 'PROCESSING');--> statement-breakpoint

ALTER TABLE "crawler_ai_cost_ledger"
  ADD COLUMN IF NOT EXISTS "reason" varchar(40);--> statement-breakpoint
ALTER TABLE "crawler_ai_cost_ledger"
  ADD COLUMN IF NOT EXISTS "mode" varchar(32);--> statement-breakpoint
ALTER TABLE "crawler_ai_cost_ledger"
  ADD COLUMN IF NOT EXISTS "failure_code" varchar(64);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_cost_ledger_status_ts_idx"
  ON "crawler_ai_cost_ledger" USING btree ("status", "timestamp");
