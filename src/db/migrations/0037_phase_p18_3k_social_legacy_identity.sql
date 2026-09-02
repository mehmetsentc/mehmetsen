-- P18.3K — Allow social mutations for LEGACY_ALLOWED Firestore-only articles.
--
-- Social tables historically FK'd article_id → news.id. Smart Feed supplements
-- LEGACY_ALLOWED cards whose Firestore doc has no PG news mirror, so like/save/
-- comment always failed with ARTICLE_NOT_FOUND.
--
-- Repair: drop news FKs only. article_id remains a durable social identity:
--   - PG / mirrored articles → news.id (via id | legacy_firestore_id | slug)
--   - LEGACY_ALLOWED FS-only → exact Firestore document id
-- No editorial news rows are created. No quarantine weaken. Exact match only.

DO $$ BEGIN
  ALTER TABLE "article_likes" DROP CONSTRAINT IF EXISTS "article_likes_article_id_news_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "saved_articles" DROP CONSTRAINT IF EXISTS "saved_articles_article_id_news_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "article_comments" DROP CONSTRAINT IF EXISTS "article_comments_article_id_news_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;
