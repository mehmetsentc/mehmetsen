-- Phase 4C — DeepSeek single-event canary run ledger (additive).
-- DO NOT apply to production in Stage 1 without explicit Stage 2 prompt.
-- No DROP / TRUNCATE. Safe additive migration.

CREATE TABLE IF NOT EXISTS "crawler_ai_canary_runs" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "cluster_id" varchar(64) NOT NULL,
  "event_key" varchar(80),
  "state" varchar(24) DEFAULT 'PREFLIGHT' NOT NULL,
  "provider" varchar(40) DEFAULT 'deepseek' NOT NULL,
  "model" varchar(80),
  "request_count" integer DEFAULT 0 NOT NULL,
  "max_requests" integer DEFAULT 2 NOT NULL,
  "estimated_input_tokens" integer,
  "estimated_output_tokens" integer,
  "estimated_cost_usd" real,
  "actual_input_tokens" integer,
  "actual_output_tokens" integer,
  "actual_cost_usd" real,
  "blocked_reason" varchar(64),
  "failure_reason" text,
  "editorial_draft_id" varchar(64),
  "output_target" varchar(32) DEFAULT 'EDITORIAL_DRAFT' NOT NULL,
  "draft_status" varchar(24) DEFAULT 'AI_DRAFT' NOT NULL,
  "auto_publish" smallint DEFAULT 0 NOT NULL,
  "lane" varchar(32) DEFAULT 'manual_canary' NOT NULL,
  "pack_snapshot" jsonb,
  "draft_snapshot" jsonb,
  "validation_snapshot" jsonb,
  "fact_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "crawler_ai_canary_runs_cluster_uidx"
  ON "crawler_ai_canary_runs" USING btree ("cluster_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_canary_runs_state_idx"
  ON "crawler_ai_canary_runs" USING btree ("state");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crawler_ai_canary_runs_created_idx"
  ON "crawler_ai_canary_runs" USING btree ("created_at");
