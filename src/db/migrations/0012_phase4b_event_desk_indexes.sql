-- Phase 4B — additive indexes for event-first newsroom list queries.
-- No DROP / TRUNCATE. Safe to apply after 0011.

-- Event desk: filter by editorial decision within recent window (ORDER BY last_seen_at DESC)
CREATE INDEX IF NOT EXISTS "news_clusters_decision_last_seen_idx"
  ON "news_clusters" USING btree ("editorial_decision", "last_seen_at" DESC);--> statement-breakpoint

-- Event desk: algorithmic eligibility + recency
CREATE INDEX IF NOT EXISTS "news_clusters_eligibility_last_seen_idx"
  ON "news_clusters" USING btree ("ai_eligibility", "last_seen_at" DESC);--> statement-breakpoint

-- Ham Haberler queue tabs: editorial status + fetched_at sort/pagination
CREATE INDEX IF NOT EXISTS "raw_articles_editorial_fetched_idx"
  ON "raw_articles" USING btree ("editorial_status", "fetched_at" DESC);
