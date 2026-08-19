ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "media_status" varchar(16) DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "media_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "primary_image_method" varchar(40);--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "image_candidate_count" integer;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "image_rejected_count" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_articles_media_status_idx" ON "raw_articles" USING btree ("media_status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_article_media" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "article_id" varchar(64) NOT NULL REFERENCES "raw_articles"("id") ON DELETE cascade,
  "media_type" varchar(16) DEFAULT 'image' NOT NULL,
  "source_url" text NOT NULL,
  "normalized_url" text NOT NULL,
  "width" integer,
  "height" integer,
  "alt_text" text,
  "caption" text,
  "credit" text,
  "mime_type" varchar(80),
  "discovery_method" varchar(40) NOT NULL,
  "score" real DEFAULT 0 NOT NULL,
  "is_primary" smallint DEFAULT 0 NOT NULL,
  "status" varchar(16) DEFAULT 'ACCEPTED' NOT NULL,
  "rejection_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crawler_article_media_article_url_uidx" ON "crawler_article_media" USING btree ("article_id", "normalized_url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_article_media_article_idx" ON "crawler_article_media" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_article_media_primary_idx" ON "crawler_article_media" USING btree ("article_id", "is_primary");--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "editorial_status" varchar(16) DEFAULT 'NEW' NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "editorial_news_id" varchar(64);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_articles_fetched_at_idx" ON "raw_articles" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_articles_source_fetched_idx" ON "raw_articles" USING btree ("source_id", "fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_articles_editorial_idx" ON "raw_articles" USING btree ("editorial_status");
