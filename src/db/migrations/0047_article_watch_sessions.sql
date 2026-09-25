-- Haber Insights: per-actor watch sessions + page dwell aggregates.
-- Public counters stay on news.views_count / likes / comments / saves / shares.
-- Duration averages are admin-only (total / session count).

ALTER TABLE "news"
  ADD COLUMN IF NOT EXISTS "page_duration_ms" integer NOT NULL DEFAULT 0;
ALTER TABLE "news"
  ADD COLUMN IF NOT EXISTS "watch_session_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "news"
  ADD COLUMN IF NOT EXISTS "page_session_count" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "article_watch_sessions" (
  "id" varchar(64) PRIMARY KEY,
  "article_id" varchar(64) NOT NULL,
  "actor_key" varchar(160) NOT NULL,
  "user_id" varchar(128),
  "session_hash" varchar(64),
  "surface" varchar(16) NOT NULL,
  "view_counted" integer NOT NULL DEFAULT 0,
  "content_dwell_ms" integer NOT NULL DEFAULT 0,
  "page_dwell_ms" integer NOT NULL DEFAULT 0,
  "first_at" timestamptz NOT NULL DEFAULT now(),
  "last_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "article_watch_sessions_actor_uidx"
  ON "article_watch_sessions" ("article_id", "actor_key", "surface");
CREATE INDEX IF NOT EXISTS "article_watch_sessions_article_last_idx"
  ON "article_watch_sessions" ("article_id", "last_at");
CREATE INDEX IF NOT EXISTS "article_watch_sessions_last_idx"
  ON "article_watch_sessions" ("last_at");
