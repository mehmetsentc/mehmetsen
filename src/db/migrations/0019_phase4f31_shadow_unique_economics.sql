-- Phase 4F.3.1 — unique shadow economics + evaluation telemetry split (ADDITIVE ONLY).
-- Historical crawler_ai_shadow_decisions rows remain queryable.
-- Evaluations may repeat per tick; economic decisions are 1 per (cluster, fingerprint, gate).
--> statement-breakpoint

ALTER TABLE "crawler_ai_shadow_decisions"
  ADD COLUMN IF NOT EXISTS "content_fingerprint" varchar(64);--> statement-breakpoint

ALTER TABLE "crawler_ai_shadow_decisions"
  ADD COLUMN IF NOT EXISTS "prespend_gate_version" varchar(24);--> statement-breakpoint

ALTER TABLE "crawler_ai_shadow_decisions"
  ADD COLUMN IF NOT EXISTS "revision_kind" varchar(24);--> statement-breakpoint

ALTER TABLE "crawler_ai_shadow_decisions"
  ADD COLUMN IF NOT EXISTS "economic_decision_id" varchar(64);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_decisions_fp_idx"
  ON "crawler_ai_shadow_decisions" USING btree ("cluster_id", "content_fingerprint");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_decisions_gate_idx"
  ON "crawler_ai_shadow_decisions" USING btree ("prespend_gate_version");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_decisions_econ_id_idx"
  ON "crawler_ai_shadow_decisions" USING btree ("economic_decision_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "crawler_ai_shadow_economic_decisions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "cluster_id" varchar(64) NOT NULL,
  "content_fingerprint" varchar(64) NOT NULL,
  "prespend_gate_version" varchar(24) NOT NULL,
  "revision_kind" varchar(24) NOT NULL,
  "event_key" varchar(80),
  "canonical_title" text,
  "first_evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "evaluation_count" integer DEFAULT 1 NOT NULL,
  "machine_eligibility" varchar(48),
  "prespend_outcome" varchar(64) NOT NULL,
  "economic_tier" varchar(8),
  "action" varchar(24) NOT NULL,
  "block_reason" varchar(64),
  "estimated_input_tokens" integer,
  "estimated_output_tokens" integer,
  "estimated_cost_usd" real,
  "cost_known" smallint DEFAULT 0 NOT NULL,
  "rank_score" real,
  "independent_source_count" integer,
  "usable_source_words" integer,
  "editorial_decision_snapshot" varchar(40),
  "meta" jsonb
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "crawler_ai_shadow_economic_unique_idx"
  ON "crawler_ai_shadow_economic_decisions"
  USING btree ("cluster_id", "content_fingerprint", "prespend_gate_version");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_economic_cluster_idx"
  ON "crawler_ai_shadow_economic_decisions" USING btree ("cluster_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_economic_action_idx"
  ON "crawler_ai_shadow_economic_decisions" USING btree ("action");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_economic_tier_idx"
  ON "crawler_ai_shadow_economic_decisions" USING btree ("economic_tier");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_economic_eval_idx"
  ON "crawler_ai_shadow_economic_decisions" USING btree ("first_evaluated_at");
