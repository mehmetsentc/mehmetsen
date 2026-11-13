-- FinOps Neon migration, phase 1 (13 Nov 2026): read-only mirror of Firestore `news`.
--
-- Hand-authored (see 0036 for why drizzle-kit generate cannot be used in this repo).
-- Additive only: one new table and its indexes. Touches no existing table, so it is
-- safe to run against the live database. Nothing reads this table until the phase-2
-- flags are turned on; nothing writes it until NEWS_PG_MIRROR=1.
--
-- Run once in the Neon SQL editor (project small-math-23549658, branch production),
-- or: psql "$DATABASE_URL" -f src/db/manual-migrations/0038_news_read_mirror.manual.sql

CREATE TABLE IF NOT EXISTS "news_read_mirror" (
  "id" varchar(128) PRIMARY KEY,
  "slug" varchar(512) NOT NULL,
  "status" varchar(32) NOT NULL,
  "published_at" timestamptz,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "category_id" varchar(128),
  "city_slug" varchar(128),
  "district_slug" varchar(128),
  "author_id" varchar(128),
  "tags" text[],
  "views" integer DEFAULT 0 NOT NULL,
  "doc" jsonb NOT NULL,
  "mirrored_at" timestamptz DEFAULT now() NOT NULL
);

-- Not unique: legacy Firestore docs can share a slug.
CREATE INDEX IF NOT EXISTS "news_read_mirror_slug_idx" ON "news_read_mirror" ("slug");
CREATE INDEX IF NOT EXISTS "news_read_mirror_status_published_idx" ON "news_read_mirror" ("status", "published_at" DESC);
CREATE INDEX IF NOT EXISTS "news_read_mirror_category_published_idx" ON "news_read_mirror" ("category_id", "published_at" DESC);
CREATE INDEX IF NOT EXISTS "news_read_mirror_city_published_idx" ON "news_read_mirror" ("city_slug", "published_at" DESC);
CREATE INDEX IF NOT EXISTS "news_read_mirror_author_published_idx" ON "news_read_mirror" ("author_id", "published_at" DESC);
CREATE INDEX IF NOT EXISTS "news_read_mirror_tags_gin" ON "news_read_mirror" USING gin ("tags");

-- Progress of the automatic backfill run by /api/cron/news-mirror-reconcile.
CREATE TABLE IF NOT EXISTS "news_read_mirror_state" (
  "key" varchar(64) PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
