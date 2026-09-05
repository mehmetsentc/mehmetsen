-- P18 feed: account-persisted local geography on user_profiles
-- city_slug / district_slug are explicit Yerel preferences (not IP).
-- local_news_cleared_at: explicit clear sentinel — do not resurrect stale prefs.

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "city_slug" varchar(64),
  ADD COLUMN IF NOT EXISTS "district_slug" varchar(64),
  ADD COLUMN IF NOT EXISTS "local_news_cleared_at" timestamptz;

CREATE INDEX IF NOT EXISTS "user_profiles_city_slug_idx" ON "user_profiles" ("city_slug");
