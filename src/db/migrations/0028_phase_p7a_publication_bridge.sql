-- Phase P7A — publication bridge fields + missing indexes (ADDITIVE ONLY).
-- Separates technical dual-write state from editorial workflow `status`.
--> statement-breakpoint

ALTER TABLE "publisher_content_items"
  ADD COLUMN IF NOT EXISTS "publication_status" varchar(24) DEFAULT 'NONE' NOT NULL;--> statement-breakpoint

ALTER TABLE "publisher_content_items"
  ADD COLUMN IF NOT EXISTS "firestore_status" varchar(24) DEFAULT 'NONE' NOT NULL;--> statement-breakpoint

ALTER TABLE "publisher_content_items"
  ADD COLUMN IF NOT EXISTS "postgres_status" varchar(24) DEFAULT 'NONE' NOT NULL;--> statement-breakpoint

ALTER TABLE "publisher_content_items"
  ADD COLUMN IF NOT EXISTS "publication_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "publisher_content_items"
  ADD COLUMN IF NOT EXISTS "publication_last_error" text;--> statement-breakpoint

ALTER TABLE "publisher_content_items"
  ADD COLUMN IF NOT EXISTS "publication_claimed_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "publisher_content_items"
  ADD COLUMN IF NOT EXISTS "publication_claimed_by" varchar(128);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pci_publisher_author_updated_idx"
  ON "publisher_content_items" USING btree ("publisher_id", "created_by", "updated_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pci_raw_article_idx"
  ON "publisher_content_items" USING btree ("crawler_raw_article_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pci_publication_partial_idx"
  ON "publisher_content_items" USING btree ("publication_status", "updated_at")
  WHERE "publication_status" IN ('PENDING', 'PUBLISHING', 'PARTIAL', 'FAILED');--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pca_publisher_content_created_idx"
  ON "publisher_content_audit" USING btree ("publisher_id", "content_id", "created_at");
