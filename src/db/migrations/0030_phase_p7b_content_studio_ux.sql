-- Phase P7B: media metadata + idempotent source import uniqueness
ALTER TABLE "publisher_content_items"
  ADD COLUMN IF NOT EXISTS "media_meta" jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS "pci_publisher_raw_article_uidx"
  ON "publisher_content_items" ("publisher_id", "crawler_raw_article_id")
  WHERE "crawler_raw_article_id" IS NOT NULL;
