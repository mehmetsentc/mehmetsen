ALTER TABLE "news_sources" ADD COLUMN IF NOT EXISTS "geographic_scope" varchar(16) DEFAULT 'NATIONAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_sources" ADD COLUMN IF NOT EXISTS "source_category" varchar(32) DEFAULT 'GENERAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_sources" ADD COLUMN IF NOT EXISTS "crawl_priority" varchar(16) DEFAULT 'NORMAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_sources" ADD COLUMN IF NOT EXISTS "quality_tier" varchar(16) DEFAULT 'UNTESTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_sources" ADD COLUMN IF NOT EXISTS "health_score" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_sources" ADD COLUMN IF NOT EXISTS "freshness_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_sources" ADD COLUMN IF NOT EXISTS "last_pause_reason" text;--> statement-breakpoint
ALTER TABLE "news_sources" ADD COLUMN IF NOT EXISTS "registry_key" varchar(80);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "news_sources_registry_key_uidx" ON "news_sources" USING btree ("registry_key");--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "quality_status" varchar(24) DEFAULT 'EXTRACTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "boilerplate_ratio" real;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "link_density" real;--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."crawler_url_status" ADD VALUE IF NOT EXISTS 'LOW_CONFIDENCE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
