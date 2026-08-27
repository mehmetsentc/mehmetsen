-- Phase P7 — Publisher Content Studio + editorial workflow (ADDITIVE ONLY).
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_content_items" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
  "source_mode" varchar(24) DEFAULT 'MANUAL' NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "spot" text,
  "summary" text,
  "body_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "body_html" text,
  "category_id" varchar(50),
  "city_slug" varchar(50),
  "district_slug" varchar(80),
  "city_name" varchar(100),
  "district_name" varchar(100),
  "hero_image_url" text,
  "video_url" text,
  "tags" text[],
  "seo_title" varchar(200),
  "seo_description" varchar(300),
  "seo_slug" varchar(300),
  "is_breaking" boolean DEFAULT false NOT NULL,
  "rights_status" varchar(32) DEFAULT 'UNKNOWN' NOT NULL,
  "rights_basis" varchar(64) DEFAULT 'UNKNOWN' NOT NULL,
  "source_url" text,
  "original_source_id" varchar(64),
  "crawler_raw_article_id" varchar(64),
  "crawler_cluster_id" varchar(64),
  "published_news_id" varchar(64),
  "published_at" timestamp with time zone,
  "scheduled_at" timestamp with time zone,
  "schedule_timezone" varchar(64) DEFAULT 'Europe/Istanbul',
  "schedule_claimed_at" timestamp with time zone,
  "schedule_claimed_by" varchar(128),
  "schedule_claim_expires_at" timestamp with time zone,
  "review_note" text,
  "created_by" varchar(128) NOT NULL,
  "updated_by" varchar(128),
  "approved_by" varchar(128),
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pci_publisher_status_updated_idx"
  ON "publisher_content_items" USING btree ("publisher_id", "status", "updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pci_publisher_scheduled_idx"
  ON "publisher_content_items" USING btree ("publisher_id", "scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pci_published_news_idx"
  ON "publisher_content_items" USING btree ("published_news_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pci_schedule_due_idx"
  ON "publisher_content_items" USING btree ("status", "scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pci_one_published_news_uidx"
  ON "publisher_content_items" ("published_news_id")
  WHERE "published_news_id" IS NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_content_items" ADD CONSTRAINT "publisher_content_items_publisher_id_publishers_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_content_revisions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "content_id" varchar(64) NOT NULL,
  "revision_number" integer NOT NULL,
  "status" varchar(32) NOT NULL,
  "snapshot" jsonb NOT NULL,
  "change_kind" varchar(48) NOT NULL,
  "note" text,
  "created_by" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "pcr_content_revision_uidx"
  ON "publisher_content_revisions" ("content_id", "revision_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pcr_content_idx"
  ON "publisher_content_revisions" USING btree ("content_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_content_revisions" ADD CONSTRAINT "publisher_content_revisions_content_id_fk"
    FOREIGN KEY ("content_id") REFERENCES "public"."publisher_content_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_content_audit" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "content_id" varchar(64) NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "actor_user_id" varchar(128),
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pca_content_idx"
  ON "publisher_content_audit" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pca_publisher_idx"
  ON "publisher_content_audit" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pca_event_idx"
  ON "publisher_content_audit" USING btree ("event_type");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_content_audit" ADD CONSTRAINT "publisher_content_audit_content_id_fk"
    FOREIGN KEY ("content_id") REFERENCES "public"."publisher_content_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_content_audit" ADD CONSTRAINT "publisher_content_audit_publisher_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
