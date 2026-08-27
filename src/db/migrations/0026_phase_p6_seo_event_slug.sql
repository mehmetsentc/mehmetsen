-- Phase P6 — SEO event slug index (minimal, additive).
--> statement-breakpoint

ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "seo_slug" varchar(200);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "news_clusters_seo_slug_idx"
  ON "news_clusters" USING btree ("seo_slug");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "news_clusters_seo_slug_uidx"
  ON "news_clusters" ("seo_slug") WHERE "seo_slug" IS NOT NULL;
