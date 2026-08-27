-- Phase P8 — Publisher advertising inventory (ADDITIVE ONLY). Inventory/slot/product-offer; no bookings/campaigns/revenue.
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_ad_inventory" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text,
  "inventory_type" varchar(24) NOT NULL,
  "placement_scope" varchar(40) NOT NULL,
  "format" varchar(32) NOT NULL,
  "semantic_size" varchar(24) DEFAULT 'STANDARD' NOT NULL,
  "status" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
  "sale_status" varchar(24) DEFAULT 'NOT_FOR_SALE' NOT NULL,
  "pricing_model" varchar(32) NOT NULL,
  "price_minor" bigint,
  "currency" varchar(3) DEFAULT 'TRY' NOT NULL,
  "period_days" integer,
  "impression_cap" integer,
  "ownership_type" varchar(24) DEFAULT 'PUBLISHER' NOT NULL,
  "is_publicly_listed" boolean DEFAULT false NOT NULL,
  "layout_item_id" varchar(64),
  "article_policy" varchar(24),
  "preview_note" text,
  "created_by" varchar(128) NOT NULL,
  "updated_by" varchar(128),
  "archived_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pai_publisher_status_idx"
  ON "publisher_ad_inventory" USING btree ("publisher_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pai_publisher_sale_idx"
  ON "publisher_ad_inventory" USING btree ("publisher_id", "sale_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pai_publisher_type_idx"
  ON "publisher_ad_inventory" USING btree ("publisher_id", "inventory_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pai_public_listing_idx"
  ON "publisher_ad_inventory" USING btree ("is_publicly_listed", "sale_status", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pai_layout_item_idx"
  ON "publisher_ad_inventory" USING btree ("layout_item_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_ad_inventory" ADD CONSTRAINT "publisher_ad_inventory_publisher_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_ad_inventory_audit" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "inventory_id" varchar(64) NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "actor_user_id" varchar(128),
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "paia_inventory_idx"
  ON "publisher_ad_inventory_audit" USING btree ("inventory_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paia_publisher_idx"
  ON "publisher_ad_inventory_audit" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paia_event_idx"
  ON "publisher_ad_inventory_audit" USING btree ("event_type");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_ad_inventory_audit" ADD CONSTRAINT "publisher_ad_inventory_audit_inventory_id_fk"
    FOREIGN KEY ("inventory_id") REFERENCES "public"."publisher_ad_inventory"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_ad_inventory_audit" ADD CONSTRAINT "publisher_ad_inventory_audit_publisher_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
