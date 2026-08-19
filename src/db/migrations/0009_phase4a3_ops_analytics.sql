ALTER TABLE "crawler_article_media" ADD COLUMN IF NOT EXISTS "image_source" varchar(24);--> statement-breakpoint
ALTER TABLE "crawler_article_media" ADD COLUMN IF NOT EXISTS "image_confidence" real;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_job_runs" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "job_name" varchar(80) NOT NULL,
  "status" varchar(24) NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone,
  "duration_ms" integer,
  "processed" integer DEFAULT 0 NOT NULL,
  "success" integer DEFAULT 0 NOT NULL,
  "skipped" integer DEFAULT 0 NOT NULL,
  "failed" integer DEFAULT 0 NOT NULL,
  "trigger" varchar(24) DEFAULT 'schedule' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_job_runs_started_idx" ON "crawler_job_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_job_runs_job_idx" ON "crawler_job_runs" USING btree ("job_name", "started_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_event_buffer" (
  "event_id" varchar(64) PRIMARY KEY NOT NULL,
  "event" varchar(24) NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "path" varchar(500) NOT NULL,
  "post_id" varchar(64),
  "visitor_hash" varchar(32) NOT NULL,
  "session_hash" varchar(32) NOT NULL,
  "referrer" varchar(120),
  "device" varchar(24),
  "city" varchar(80),
  "country" varchar(8),
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "scroll_depth" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_event_buffer_occurred_idx" ON "analytics_event_buffer" USING btree ("occurred_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_hourly" (
  "hour" varchar(16) PRIMARY KEY NOT NULL,
  "pageviews" integer DEFAULT 0 NOT NULL,
  "unique_visitors" integer DEFAULT 0 NOT NULL,
  "sessions" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_daily" (
  "day" varchar(10) PRIMARY KEY NOT NULL,
  "pageviews" integer DEFAULT 0 NOT NULL,
  "unique_visitors" integer DEFAULT 0 NOT NULL,
  "sessions" integer DEFAULT 0 NOT NULL,
  "bounce_approx" real DEFAULT 0 NOT NULL,
  "avg_duration_ms" integer DEFAULT 0 NOT NULL,
  "avg_scroll_depth" integer DEFAULT 0 NOT NULL,
  "top_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "top_posts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "referrers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "devices" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_daily_day_uidx" ON "analytics_daily" USING btree ("day");
