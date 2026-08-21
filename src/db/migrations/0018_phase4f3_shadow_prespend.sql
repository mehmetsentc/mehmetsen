-- Phase 4F.3 — additive shadow auto-draft decision log (never paid).
-- PRESPEND_REJECTED / WOULD_BLOCK does not delete events or jobs.

CREATE TABLE IF NOT EXISTS "crawler_ai_shadow_decisions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "cluster_id" varchar(64) NOT NULL,
  "event_key" varchar(80),
  "canonical_title" text,
  "evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
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

CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_decisions_cluster_idx"
  ON "crawler_ai_shadow_decisions" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_decisions_eval_idx"
  ON "crawler_ai_shadow_decisions" USING btree ("evaluated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_decisions_outcome_idx"
  ON "crawler_ai_shadow_decisions" USING btree ("prespend_outcome");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_decisions_action_idx"
  ON "crawler_ai_shadow_decisions" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_shadow_decisions_tier_idx"
  ON "crawler_ai_shadow_decisions" USING btree ("economic_tier");
