-- Aggregate qualified read/view dwell for algorithm + "kaç dakika okundu".
-- View counts stay on news.views_count; this is total dwell milliseconds.

ALTER TABLE "news"
  ADD COLUMN IF NOT EXISTS "read_duration_ms" integer NOT NULL DEFAULT 0;
