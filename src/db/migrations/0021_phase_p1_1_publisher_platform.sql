-- Phase P1.1 — Publisher Platform (ADDITIVE ONLY).
--> statement-breakpoint

-- Align legacy P1 status vocabulary → P1.1 operational / verification split.
UPDATE "publishers" SET "status" = 'ACTIVE' WHERE "status" = 'VERIFIED';--> statement-breakpoint
UPDATE "publishers" SET "status" = 'UNCLAIMED' WHERE "status" = 'PENDING_CLAIM';--> statement-breakpoint
UPDATE "publishers" SET "verification_status" = 'UNCLAIMED' WHERE "verification_status" = 'UNVERIFIED';--> statement-breakpoint

-- Invariant: at most one ACTIVE OWNER per publisher (historical/inactive members OK).
CREATE UNIQUE INDEX IF NOT EXISTS "publisher_members_one_active_owner_uidx"
  ON "publisher_members" ("publisher_id")
  WHERE "role" = 'OWNER' AND "status" = 'ACTIVE';--> statement-breakpoint

-- Publisher article resolution: source + editorial status + recency.
CREATE INDEX IF NOT EXISTS "raw_articles_source_editorial_published_idx"
  ON "raw_articles" ("source_id", "editorial_status", "published_at" DESC)
  WHERE "editorial_news_id" IS NOT NULL;--> statement-breakpoint
