-- P18.3O — Allow durable seen/read records for LEGACY_ALLOWED FS-only articles.
--
-- user_content_impressions.article_id historically FK'd → news.id.
-- Smart Feed serves LEGACY_ALLOWED cards with Firestore-only ids; inserts failed
-- silently (or never persisted), so app-restart replayed consumed stories.
--
-- Repair: drop news FK only. article_id remains a durable identity:
--   - PG / mirrored → news.id
--   - LEGACY_ALLOWED FS-only → exact Firestore document id
-- Presence in this table = suppressible seen/read. impression_count still
-- tracks qualified feed impressions only (article-open uses count=0 rows).

DO $$ BEGIN
  ALTER TABLE "user_content_impressions" DROP CONSTRAINT IF EXISTS "user_content_impressions_article_id_news_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_content_impressions" DROP CONSTRAINT IF EXISTS "user_content_impressions_article_id_news_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;--> statement-breakpoint

-- Bound lookups by recency (used with ORDER BY last_seen_at DESC).
CREATE INDEX IF NOT EXISTS "user_content_impressions_user_last_seen_idx"
  ON "user_content_impressions" ("user_id", "last_seen_at" DESC);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_content_impressions_session_last_seen_idx"
  ON "user_content_impressions" ("session_id", "last_seen_at" DESC);
