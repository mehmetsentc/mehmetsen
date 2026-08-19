ALTER TABLE "crawler_article_media" ADD COLUMN IF NOT EXISTS "quality_score" real;--> statement-breakpoint
ALTER TABLE "crawler_article_media" ADD COLUMN IF NOT EXISTS "content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "crawler_article_media" ADD COLUMN IF NOT EXISTS "perceptual_hash" varchar(32);
