-- P18.4B — Canonical migration foundation (schema only).
-- Adds durable publication provenance + migration provenance on news.
-- Does NOT migrate Firestore content. Does NOT publish.
-- legacy_firestore_id uniqueness already exists (unique constraint).

DO $$ BEGIN
  CREATE TYPE "public"."publication_authority" AS ENUM('HUMAN_EDITOR', 'SYSTEM_ALERT', 'LEGACY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "publication_authority" "publication_authority";--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "approved_by" varchar(128);--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "published_by" varchar(128);--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "migrated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "migration_batch_id" varchar(64);--> statement-breakpoint

-- Ensure legacy_firestore_id remains unique (idempotent migration target key).
DO $$ BEGIN
  ALTER TABLE "news" ADD CONSTRAINT "news_legacy_firestore_id_unique" UNIQUE ("legacy_firestore_id");
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "news_publication_authority_idx" ON "news" ("publication_authority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_migration_batch_idx" ON "news" ("migration_batch_id");
