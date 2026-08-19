CREATE TYPE "public"."crawler_ai_eligibility" AS ENUM('PENDING', 'ELIGIBLE', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."crawler_article_fetch_mode" AS ENUM('HTTP', 'BROWSER', 'AUTO');--> statement-breakpoint
CREATE TYPE "public"."crawler_cluster_status" AS ENUM('PENDING', 'CLUSTERED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."crawler_discovery_method" AS ENUM('RSS', 'ATOM', 'NEWS_SITEMAP', 'SITEMAP', 'LISTING', 'HYBRID');--> statement-breakpoint
CREATE TYPE "public"."crawler_robots_policy" AS ENUM('FOLLOW', 'STRICT', 'IGNORE');--> statement-breakpoint
CREATE TYPE "public"."crawler_source_status" AS ENUM('ACTIVE', 'PAUSED', 'DEGRADED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."crawler_source_type" AS ENUM('NATIONAL', 'LOCAL', 'INTERNATIONAL', 'AGENCY', 'MAGAZINE', 'SPORT', 'FINANCE', 'TECHNOLOGY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."crawler_url_status" AS ENUM('PENDING_FETCH', 'FETCHING', 'FETCHED', 'EXTRACTED', 'DUPLICATE', 'CLUSTER_PENDING', 'AI_ELIGIBLE', 'AI_SKIPPED', 'FAILED', 'FAILED_404', 'FAILED_SSRF');--> statement-breakpoint
CREATE TABLE "ai_processing_cache" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"prompt_version" varchar(80) NOT NULL,
	"model" varchar(80) NOT NULL,
	"result_id" varchar(64),
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawler_metrics_daily" (
	"day" date NOT NULL,
	"metric" varchar(64) NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovered_article_urls" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"source_id" varchar(64) NOT NULL,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"canonical_url" text,
	"url_hash" varchar(64) NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at_hint" timestamp with time zone,
	"status" "crawler_url_status" DEFAULT 'PENDING_FETCH' NOT NULL,
	"fetch_attempts" integer DEFAULT 0 NOT NULL,
	"last_fetch_attempt" timestamp with time zone,
	"failure_reason" text,
	"etag" varchar(255),
	"last_modified" varchar(255),
	"logical_queue" varchar(32) DEFAULT 'ARTICLE_FETCH_QUEUE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_clusters" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"representative_article_id" varchar(64),
	"normalized_topic" varchar(300),
	"country_code" varchar(2),
	"city" varchar(100),
	"category" varchar(80),
	"article_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_sources" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"domain" varchar(255) NOT NULL,
	"base_url" text NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"country_name" varchar(100),
	"region" varchar(100),
	"city" varchar(100),
	"district" varchar(100),
	"language" varchar(16) NOT NULL,
	"timezone" varchar(64),
	"source_type" "crawler_source_type" DEFAULT 'OTHER' NOT NULL,
	"status" "crawler_source_status" DEFAULT 'PAUSED' NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"trust_tier" smallint DEFAULT 3 NOT NULL,
	"discovery_method" "crawler_discovery_method" DEFAULT 'RSS' NOT NULL,
	"rss_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sitemap_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"listing_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"crawl_interval_seconds" integer DEFAULT 300 NOT NULL,
	"article_fetch_mode" "crawler_article_fetch_mode" DEFAULT 'AUTO' NOT NULL,
	"requires_javascript" smallint DEFAULT 0 NOT NULL,
	"robots_policy" "crawler_robots_policy" DEFAULT 'FOLLOW' NOT NULL,
	"last_discovery_at" timestamp with time zone,
	"next_discovery_at" timestamp with time zone,
	"last_successful_discovery_at" timestamp with time zone,
	"last_feed_etag" varchar(255),
	"last_feed_modified" varchar(255),
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"average_response_ms" integer,
	"articles_discovered" integer DEFAULT 0 NOT NULL,
	"articles_fetched" integer DEFAULT 0 NOT NULL,
	"extraction_success_rate" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_articles" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"source_id" varchar(64) NOT NULL,
	"discovered_url_id" varchar(64),
	"cluster_id" varchar(64),
	"original_url" text NOT NULL,
	"normalized_url" text,
	"canonical_url" text,
	"url_hash" varchar(64),
	"title" text,
	"description" text,
	"article_body_text" text,
	"article_body_html" text,
	"author" varchar(300),
	"published_at" timestamp with time zone,
	"modified_at" timestamp with time zone,
	"language" varchar(16),
	"country_code" varchar(2),
	"region" varchar(100),
	"city" varchar(100),
	"district" varchar(100),
	"main_image_url" text,
	"image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"word_count" integer,
	"char_count" integer,
	"paragraph_count" integer,
	"content_hash" varchar(64),
	"title_hash" varchar(64),
	"simhash" varchar(16),
	"extraction_method" varchar(40),
	"extraction_confidence" real,
	"http_status" integer,
	"fetch_duration_ms" integer,
	"fetched_at" timestamp with time zone,
	"ai_eligibility" "crawler_ai_eligibility" DEFAULT 'PENDING' NOT NULL,
	"ai_skip_reason" varchar(80),
	"cluster_status" "crawler_cluster_status" DEFAULT 'PENDING' NOT NULL,
	"is_exact_duplicate" smallint DEFAULT 0 NOT NULL,
	"duplicate_of_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discovered_article_urls" ADD CONSTRAINT "discovered_article_urls_source_id_news_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."news_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD CONSTRAINT "raw_articles_source_id_news_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."news_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD CONSTRAINT "raw_articles_discovered_url_id_discovered_article_urls_id_fk" FOREIGN KEY ("discovered_url_id") REFERENCES "public"."discovered_article_urls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD CONSTRAINT "raw_articles_cluster_id_news_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."news_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_processing_cache_key_uidx" ON "ai_processing_cache" USING btree ("content_hash","prompt_version","model");--> statement-breakpoint
CREATE UNIQUE INDEX "crawler_metrics_daily_pk" ON "crawler_metrics_daily" USING btree ("day","metric");--> statement-breakpoint
CREATE UNIQUE INDEX "discovered_article_urls_hash_uidx" ON "discovered_article_urls" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "discovered_article_urls_status_idx" ON "discovered_article_urls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "discovered_article_urls_source_idx" ON "discovered_article_urls" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "discovered_article_urls_queue_idx" ON "discovered_article_urls" USING btree ("logical_queue","status");--> statement-breakpoint
CREATE INDEX "news_clusters_country_idx" ON "news_clusters" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "news_clusters_last_seen_idx" ON "news_clusters" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "news_sources_status_next_idx" ON "news_sources" USING btree ("status","next_discovery_at");--> statement-breakpoint
CREATE INDEX "news_sources_domain_idx" ON "news_sources" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "news_sources_country_idx" ON "news_sources" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "raw_articles_source_idx" ON "raw_articles" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "raw_articles_content_hash_idx" ON "raw_articles" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "raw_articles_title_hash_idx" ON "raw_articles" USING btree ("title_hash");--> statement-breakpoint
CREATE INDEX "raw_articles_canonical_idx" ON "raw_articles" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "raw_articles_ai_idx" ON "raw_articles" USING btree ("ai_eligibility");--> statement-breakpoint
CREATE INDEX "raw_articles_cluster_status_idx" ON "raw_articles" USING btree ("cluster_status");--> statement-breakpoint
CREATE INDEX "raw_articles_cluster_idx" ON "raw_articles" USING btree ("cluster_id");