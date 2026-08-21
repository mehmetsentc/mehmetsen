-- Phase 4F.1 — Design A machine auto-draft eligibility (additive only)
-- HUMAN editorial_decision / APPROVED_FOR_AI must NEVER be written by machine path.
-- Forbidden: DROP, TRUNCATE, destructive enum rewrite, data reset.

ALTER TABLE "news_clusters"
  ADD COLUMN IF NOT EXISTS "machine_draft_eligibility" varchar(32);--> statement-breakpoint
ALTER TABLE "news_clusters"
  ADD COLUMN IF NOT EXISTS "machine_draft_eligibility_reason" text;--> statement-breakpoint
ALTER TABLE "news_clusters"
  ADD COLUMN IF NOT EXISTS "machine_draft_eligibility_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news_clusters"
  ADD COLUMN IF NOT EXISTS "machine_draft_eligibility_meta" jsonb;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "news_clusters_machine_draft_eligibility_idx"
  ON "news_clusters" USING btree ("machine_draft_eligibility");
