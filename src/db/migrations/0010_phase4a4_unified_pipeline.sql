ALTER TABLE "discovered_article_urls" ADD COLUMN IF NOT EXISTS "discovery_lane" varchar(24) DEFAULT 'CRAWLER';--> statement-breakpoint
ALTER TABLE "discovered_article_urls" ADD COLUMN IF NOT EXISTS "discovery_lanes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "discovered_article_urls" ADD COLUMN IF NOT EXISTS "title_hint" text;--> statement-breakpoint
ALTER TABLE "discovered_article_urls" ADD COLUMN IF NOT EXISTS "guid" varchar(500);--> statement-breakpoint
ALTER TABLE "discovered_article_urls" ADD COLUMN IF NOT EXISTS "discovery_primary_image_candidate" text;--> statement-breakpoint
ALTER TABLE "discovered_article_urls" ADD COLUMN IF NOT EXISTS "rss_description" text;--> statement-breakpoint
ALTER TABLE "discovered_article_urls" ADD COLUMN IF NOT EXISTS "feed_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "quality_gate_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "rss_snippet_used_as_body" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "cluster_role" varchar(24);--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "discovery_primary_image_candidate" text;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "primary_image_confidence" real;--> statement-breakpoint
ALTER TABLE "cluster_memberships" ADD COLUMN IF NOT EXISTS "membership_role" varchar(24) DEFAULT 'SUPPORTING';--> statement-breakpoint
ALTER TABLE "cluster_memberships" ADD COLUMN IF NOT EXISTS "is_independent_source" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "primary_selection_score" real;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "primary_selection_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "published_news_id" varchar(64);--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "future_ai_unit" varchar(24) DEFAULT 'PREPARED';--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "update_review_status" varchar(24) DEFAULT 'NONE';--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "primary_image_url" text;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "primary_source_id" varchar(64);--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "primary_source_name" varchar(200);
