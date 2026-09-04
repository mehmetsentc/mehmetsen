-- P18.4D.2 — Canonical news rights decision foundation (schema only).
-- Durable human rights decision fields on PG news.
-- Does NOT publish. Does NOT migrate content. Does NOT clear rights for pilots.

DO $$ BEGIN
  CREATE TYPE "public"."news_rights_status" AS ENUM(
    'PENDING',
    'CLEARED',
    'REWRITE_REQUIRED',
    'DO_NOT_PUBLISH'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."news_rights_basis" AS ENUM(
    'UNKNOWN',
    'PUBLISHER_ORIGINAL',
    'SOURCE_ASSOCIATED',
    'LICENSED',
    'OWNED',
    'OFFICIAL_RELEASE',
    'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
    'HUMAN_REVIEWED_OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "rights_status" "news_rights_status" DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "rights_basis" "news_rights_basis" DEFAULT 'UNKNOWN';--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "rights_decided_by" varchar(128);--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "rights_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "editorial_blocker" varchar(64);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "news_rights_status_idx" ON "news" ("rights_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_editorial_blocker_idx" ON "news" ("editorial_blocker");
