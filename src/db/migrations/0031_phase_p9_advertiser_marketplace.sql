-- Phase P9 — Advertiser marketplace + booking requests (ADDITIVE ONLY).
-- No payment / revenue / ad serving / impressions.
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "advertisers" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "name" varchar(200) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "advertiser_type" varchar(24) NOT NULL,
  "status" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
  "website_url" text,
  "city" varchar(100),
  "country" varchar(2) DEFAULT 'TR',
  "logo_url" text,
  "created_by" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "advertisers_slug_uidx"
  ON "advertisers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertisers_status_idx"
  ON "advertisers" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertisers_city_idx"
  ON "advertisers" USING btree ("city");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "advertiser_members" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "advertiser_id" varchar(64) NOT NULL,
  "user_id" varchar(128) NOT NULL,
  "role" varchar(24) NOT NULL,
  "status" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "advertiser_members_adv_user_uidx"
  ON "advertiser_members" USING btree ("advertiser_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertiser_members_user_idx"
  ON "advertiser_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertiser_members_advertiser_idx"
  ON "advertiser_members" USING btree ("advertiser_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "advertiser_members" ADD CONSTRAINT "advertiser_members_advertiser_id_fk"
    FOREIGN KEY ("advertiser_id") REFERENCES "public"."advertisers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "advertiser_campaigns" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "advertiser_id" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "objective" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
  "start_at" timestamp with time zone,
  "end_at" timestamp with time zone,
  "budget_minor" bigint,
  "currency" varchar(3) DEFAULT 'TRY' NOT NULL,
  "created_by" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "advertiser_campaigns_adv_status_upd_idx"
  ON "advertiser_campaigns" USING btree ("advertiser_id", "status", "updated_at");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "advertiser_campaigns" ADD CONSTRAINT "advertiser_campaigns_advertiser_id_fk"
    FOREIGN KEY ("advertiser_id") REFERENCES "public"."advertisers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "advertiser_creatives" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "advertiser_id" varchar(64) NOT NULL,
  "campaign_id" varchar(64),
  "name" varchar(200) NOT NULL,
  "creative_type" varchar(32) NOT NULL,
  "headline" varchar(200),
  "body" text,
  "media_url" text,
  "destination_url" text,
  "status" varchar(24) DEFAULT 'DRAFT' NOT NULL,
  "platform_moderation_status" varchar(24) DEFAULT 'PENDING' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by" varchar(128) NOT NULL,
  "updated_by" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "advertiser_creatives_adv_status_idx"
  ON "advertiser_creatives" USING btree ("advertiser_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertiser_creatives_campaign_idx"
  ON "advertiser_creatives" USING btree ("campaign_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "advertiser_creatives" ADD CONSTRAINT "advertiser_creatives_advertiser_id_fk"
    FOREIGN KEY ("advertiser_id") REFERENCES "public"."advertisers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "advertiser_creatives" ADD CONSTRAINT "advertiser_creatives_campaign_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "public"."advertiser_campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ad_booking_requests" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "advertiser_id" varchar(64) NOT NULL,
  "campaign_id" varchar(64) NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "inventory_id" varchar(64) NOT NULL,
  "creative_id" varchar(64),
  "status" varchar(24) DEFAULT 'DRAFT' NOT NULL,
  "requested_start_at" timestamp with time zone NOT NULL,
  "requested_end_at" timestamp with time zone NOT NULL,
  "requested_impressions" integer,
  "price_snapshot_minor" bigint,
  "pricing_model_snapshot" varchar(32) NOT NULL,
  "duration_snapshot" integer,
  "impression_snapshot" integer,
  "currency" varchar(3) DEFAULT 'TRY' NOT NULL,
  "message" text,
  "publisher_offer_minor" bigint,
  "publisher_note" text,
  "creative_review_status" varchar(24),
  "expires_at" timestamp with time zone,
  "created_by" varchar(128) NOT NULL,
  "publisher_reviewed_by" varchar(128),
  "publisher_reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "abr_advertiser_status_idx"
  ON "ad_booking_requests" USING btree ("advertiser_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abr_publisher_status_idx"
  ON "ad_booking_requests" USING btree ("publisher_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abr_inventory_dates_idx"
  ON "ad_booking_requests" USING btree ("inventory_id", "requested_start_at", "requested_end_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "abr_campaign_idx"
  ON "ad_booking_requests" USING btree ("campaign_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ad_booking_requests" ADD CONSTRAINT "abr_advertiser_id_fk"
    FOREIGN KEY ("advertiser_id") REFERENCES "public"."advertisers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ad_booking_requests" ADD CONSTRAINT "abr_campaign_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "public"."advertiser_campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ad_booking_requests" ADD CONSTRAINT "abr_publisher_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ad_booking_requests" ADD CONSTRAINT "abr_inventory_id_fk"
    FOREIGN KEY ("inventory_id") REFERENCES "public"."publisher_ad_inventory"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ad_booking_requests" ADD CONSTRAINT "abr_creative_id_fk"
    FOREIGN KEY ("creative_id") REFERENCES "public"."advertiser_creatives"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ad_bookings" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "booking_request_id" varchar(64) NOT NULL,
  "advertiser_id" varchar(64) NOT NULL,
  "campaign_id" varchar(64) NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "inventory_id" varchar(64) NOT NULL,
  "creative_id" varchar(64),
  "creative_snapshot" jsonb,
  "status" varchar(24) DEFAULT 'PENDING_PAYMENT' NOT NULL,
  "start_at" timestamp with time zone NOT NULL,
  "end_at" timestamp with time zone NOT NULL,
  "impression_limit" integer,
  "price_minor" bigint,
  "currency" varchar(3) DEFAULT 'TRY' NOT NULL,
  "pricing_model_snapshot" varchar(32) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ad_bookings_request_uidx"
  ON "ad_bookings" USING btree ("booking_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_bookings_inventory_dates_status_idx"
  ON "ad_bookings" USING btree ("inventory_id", "start_at", "end_at", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_bookings_publisher_status_idx"
  ON "ad_bookings" USING btree ("publisher_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_bookings_advertiser_idx"
  ON "ad_bookings" USING btree ("advertiser_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ad_bookings" ADD CONSTRAINT "ad_bookings_request_id_fk"
    FOREIGN KEY ("booking_request_id") REFERENCES "public"."ad_booking_requests"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ad_bookings" ADD CONSTRAINT "ad_bookings_advertiser_id_fk"
    FOREIGN KEY ("advertiser_id") REFERENCES "public"."advertisers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ad_bookings" ADD CONSTRAINT "ad_bookings_campaign_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "public"."advertiser_campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ad_bookings" ADD CONSTRAINT "ad_bookings_publisher_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ad_bookings" ADD CONSTRAINT "ad_bookings_inventory_id_fk"
    FOREIGN KEY ("inventory_id") REFERENCES "public"."publisher_ad_inventory"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "marketplace_audit_events" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "actor_user_id" varchar(128),
  "advertiser_id" varchar(64),
  "publisher_id" varchar(64),
  "entity_type" varchar(32),
  "entity_id" varchar(64),
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mae_event_idx"
  ON "marketplace_audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mae_advertiser_idx"
  ON "marketplace_audit_events" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mae_publisher_idx"
  ON "marketplace_audit_events" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mae_entity_idx"
  ON "marketplace_audit_events" USING btree ("entity_type", "entity_id");--> statement-breakpoint
