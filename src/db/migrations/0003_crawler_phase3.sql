ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "event_key" varchar(80);--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "canonical_title" text;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "language" varchar(16);--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "region" varchar(100);--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "district" varchar(100);--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "category_hint" varchar(80);--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "event_status" varchar(16) DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "latest_article_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "source_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "unique_source_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "high_quality_source_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "source_diversity_score" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "importance_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "global_importance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "national_importance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "local_importance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "freshness_score" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "cluster_confidence" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "ai_eligibility" varchar(24) DEFAULT 'WATCHING' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "ai_eligibility_reason" text;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "importance_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "signature_tokens" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "has_material_update" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "material_update_reason" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_clusters_event_key_idx" ON "news_clusters" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_clusters_eligibility_idx" ON "news_clusters" USING btree ("ai_eligibility");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_clusters_language_idx" ON "news_clusters" USING btree ("language");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cluster_memberships" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "cluster_id" varchar(64) NOT NULL REFERENCES "news_clusters"("id") ON DELETE cascade,
  "article_id" varchar(64) NOT NULL REFERENCES "raw_articles"("id") ON DELETE cascade,
  "source_id" varchar(64) NOT NULL REFERENCES "news_sources"("id") ON DELETE cascade,
  "similarity_score" real DEFAULT 1 NOT NULL,
  "match_band" varchar(16) DEFAULT 'LOW' NOT NULL,
  "match_explanation" jsonb,
  "is_canonical" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cluster_memberships_article_uidx" ON "cluster_memberships" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cluster_memberships_cluster_idx" ON "cluster_memberships" USING btree ("cluster_id");