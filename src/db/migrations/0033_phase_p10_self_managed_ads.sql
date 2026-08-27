-- Phase P10 — Publisher self-managed ads + creatives + impressions/clicks (ADDITIVE).
-- No payment / marketplace activation / commercial ledger changes.
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_managed_ads" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "inventory_id" varchar(64) NOT NULL,
  "name" varchar(160) NOT NULL,
  "advertiser_name" varchar(160) NOT NULL,
  "advertiser_id" varchar(64),
  "status" varchar(24) DEFAULT 'DRAFT' NOT NULL,
  "start_at" timestamp with time zone NOT NULL,
  "end_at" timestamp with time zone NOT NULL,
  "destination_url" text,
  "internal_note" text,
  "source_type" varchar(24) DEFAULT 'SELF_MANAGED' NOT NULL,
  "created_by" varchar(128) NOT NULL,
  "updated_by" varchar(128),
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pma_publisher_status_time_idx"
  ON "publisher_managed_ads" USING btree ("publisher_id", "status", "start_at", "end_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pma_inventory_time_idx"
  ON "publisher_managed_ads" USING btree ("inventory_id", "start_at", "end_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pma_publisher_updated_idx"
  ON "publisher_managed_ads" USING btree ("publisher_id", "updated_at");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_managed_ads" ADD CONSTRAINT "pma_publisher_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_managed_ads" ADD CONSTRAINT "pma_inventory_id_fk"
    FOREIGN KEY ("inventory_id") REFERENCES "public"."publisher_ad_inventory"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_ad_creatives" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "ad_id" varchar(64) NOT NULL,
  "creative_type" varchar(32) NOT NULL,
  "media_url" text NOT NULL,
  "thumbnail_url" text,
  "headline" varchar(200),
  "body" text,
  "alt_text" varchar(300),
  "duration_seconds" integer,
  "version" integer DEFAULT 1 NOT NULL,
  "is_current" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pac_ad_idx"
  ON "publisher_ad_creatives" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pac_ad_current_idx"
  ON "publisher_ad_creatives" USING btree ("ad_id", "is_current");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pac_publisher_idx"
  ON "publisher_ad_creatives" USING btree ("publisher_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_ad_creatives" ADD CONSTRAINT "pac_publisher_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_ad_creatives" ADD CONSTRAINT "pac_ad_id_fk"
    FOREIGN KEY ("ad_id") REFERENCES "public"."publisher_managed_ads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_ad_impressions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "ad_id" varchar(64) NOT NULL,
  "creative_id" varchar(64) NOT NULL,
  "inventory_id" varchar(64) NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "user_id" varchar(128),
  "session_id" varchar(128),
  "device_class" varchar(24),
  "referrer_type" varchar(32),
  "dedupe_key" varchar(160),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pai_imp_ad_created_idx"
  ON "publisher_ad_impressions" USING btree ("ad_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pai_imp_publisher_created_idx"
  ON "publisher_ad_impressions" USING btree ("publisher_id", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pai_imp_dedupe_uidx"
  ON "publisher_ad_impressions" ("dedupe_key")
  WHERE "dedupe_key" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_ad_clicks" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "ad_id" varchar(64) NOT NULL,
  "creative_id" varchar(64),
  "inventory_id" varchar(64) NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "impression_id" varchar(64),
  "user_id" varchar(128),
  "session_id" varchar(128),
  "destination_url_snapshot" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "paclick_ad_created_idx"
  ON "publisher_ad_clicks" USING btree ("ad_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paclick_publisher_created_idx"
  ON "publisher_ad_clicks" USING btree ("publisher_id", "created_at");
