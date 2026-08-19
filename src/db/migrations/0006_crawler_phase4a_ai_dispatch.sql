CREATE TABLE IF NOT EXISTS "crawler_ai_jobs" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "cluster_id" varchar(64) NOT NULL REFERENCES "news_clusters"("id") ON DELETE cascade,
  "event_key" varchar(80),
  "status" varchar(24) DEFAULT 'PENDING' NOT NULL,
  "dispatch_type" varchar(24) DEFAULT 'INITIAL' NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "eligibility_status" varchar(24),
  "estimated_input_tokens" integer,
  "estimated_output_tokens" integer,
  "estimated_total_tokens" integer,
  "estimated_cost_usd" real,
  "actual_input_tokens" integer,
  "actual_output_tokens" integer,
  "actual_cost_usd" real,
  "model" varchar(80),
  "provider" varchar(40),
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 2 NOT NULL,
  "reserved_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "blocked_reason" varchar(64),
  "failure_reason" text,
  "editorial_news_id" varchar(64),
  "output_target" varchar(32) DEFAULT 'EDITORIAL_DRAFT' NOT NULL,
  "selected_source_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_jobs_status_idx" ON "crawler_ai_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_jobs_cluster_idx" ON "crawler_ai_jobs" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_jobs_created_idx" ON "crawler_ai_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_jobs_priority_idx" ON "crawler_ai_jobs" USING btree ("priority");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crawler_ai_jobs_cluster_initial_uidx" ON "crawler_ai_jobs" ("cluster_id") WHERE "dispatch_type" = 'INITIAL';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_ai_cost_ledger" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "provider" varchar(40) NOT NULL,
  "model" varchar(80),
  "lane" varchar(32) NOT NULL,
  "job_id" varchar(64),
  "cluster_id" varchar(64),
  "request_type" varchar(40),
  "input_tokens" integer,
  "output_tokens" integer,
  "estimated_cost_usd" real,
  "actual_cost_usd" real,
  "status" varchar(24) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_cost_ledger_lane_ts_idx" ON "crawler_ai_cost_ledger" USING btree ("lane","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_cost_ledger_job_idx" ON "crawler_ai_cost_ledger" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_cost_ledger_cluster_idx" ON "crawler_ai_cost_ledger" USING btree ("cluster_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_ai_budget_windows" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "lane" varchar(32) NOT NULL,
  "period_type" varchar(16) NOT NULL,
  "period_key" varchar(32) NOT NULL,
  "reserved_usd" real DEFAULT 0 NOT NULL,
  "spent_usd" real DEFAULT 0 NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crawler_ai_budget_windows_uidx" ON "crawler_ai_budget_windows" USING btree ("lane","period_type","period_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_budget_windows_period_idx" ON "crawler_ai_budget_windows" USING btree ("period_type","period_key");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_ai_circuit" (
  "provider" varchar(40) PRIMARY KEY NOT NULL,
  "state" varchar(16) DEFAULT 'CLOSED' NOT NULL,
  "opened_at" timestamp with time zone,
  "reason" varchar(80),
  "consecutive_429" integer DEFAULT 0 NOT NULL,
  "consecutive_5xx" integer DEFAULT 0 NOT NULL,
  "last_status" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_ai_dispatch_shadow" (
  "cluster_id" varchar(64) PRIMARY KEY NOT NULL,
  "event_key" varchar(80),
  "canonical_title" text,
  "eligibility" varchar(24),
  "would_dispatch" smallint DEFAULT 0 NOT NULL,
  "blocked_reason" varchar(64),
  "dispatch_type" varchar(24) DEFAULT 'INITIAL' NOT NULL,
  "estimated_input_tokens" integer,
  "estimated_output_tokens" integer,
  "estimated_total_tokens" integer,
  "estimated_cost_usd" real,
  "estimated_pipeline_tokens" integer,
  "estimated_pipeline_cost_usd" real,
  "selected_source_count" integer DEFAULT 0 NOT NULL,
  "selected_source_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "importance_score" integer DEFAULT 0 NOT NULL,
  "local_importance" integer DEFAULT 0 NOT NULL,
  "national_importance" integer DEFAULT 0 NOT NULL,
  "global_importance" integer DEFAULT 0 NOT NULL,
  "geographic_scope" varchar(16),
  "is_local_protected" smallint DEFAULT 0 NOT NULL,
  "evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_dispatch_shadow_would_idx" ON "crawler_ai_dispatch_shadow" USING btree ("would_dispatch");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_dispatch_shadow_eval_idx" ON "crawler_ai_dispatch_shadow" USING btree ("evaluated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_ai_dispatch_shadow_reason_idx" ON "crawler_ai_dispatch_shadow" USING btree ("blocked_reason");
