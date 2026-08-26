-- Phase P2 — Publisher Studio + Layout Engine (ADDITIVE ONLY).
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_layouts" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "name" varchar(200) DEFAULT 'Ana Sayfa' NOT NULL,
  "status" varchar(24) DEFAULT 'DRAFT' NOT NULL,
  "theme_key" varchar(32) DEFAULT 'MODERN' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "publisher_layouts_publisher_idx" ON "publisher_layouts" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_layouts_status_idx" ON "publisher_layouts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "publisher_layouts_one_draft_uidx"
  ON "publisher_layouts" ("publisher_id")
  WHERE "status" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "publisher_layouts_one_published_uidx"
  ON "publisher_layouts" ("publisher_id")
  WHERE "status" = 'PUBLISHED';--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_layouts" ADD CONSTRAINT "publisher_layouts_publisher_id_publishers_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_layout_sections" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "layout_id" varchar(64) NOT NULL,
  "title" varchar(200) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "section_type" varchar(32) DEFAULT 'CUSTOM' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "display_style" varchar(32) DEFAULT 'GRID' NOT NULL,
  "is_visible" boolean DEFAULT true NOT NULL,
  "content_mode" varchar(16) DEFAULT 'MANUAL' NOT NULL,
  "auto_config" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "publisher_layout_sections_layout_idx" ON "publisher_layout_sections" USING btree ("layout_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "publisher_layout_sections_layout_slug_uidx"
  ON "publisher_layout_sections" ("layout_id", "slug");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_layout_sections" ADD CONSTRAINT "publisher_layout_sections_layout_id_publisher_layouts_id_fk"
    FOREIGN KEY ("layout_id") REFERENCES "public"."publisher_layouts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_layout_items" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "layout_id" varchar(64) NOT NULL,
  "section_id" varchar(64) NOT NULL,
  "item_type" varchar(24) DEFAULT 'ARTICLE' NOT NULL,
  "content_id" varchar(128),
  "position" integer DEFAULT 0 NOT NULL,
  "size" varchar(24) DEFAULT 'STANDARD' NOT NULL,
  "span" integer DEFAULT 4 NOT NULL,
  "presentation" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "publisher_layout_items_layout_idx" ON "publisher_layout_items" USING btree ("layout_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_layout_items_section_idx" ON "publisher_layout_items" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "publisher_layout_items_article_once_uidx"
  ON "publisher_layout_items" ("layout_id", "content_id")
  WHERE "item_type" = 'ARTICLE' AND "content_id" IS NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_layout_items" ADD CONSTRAINT "publisher_layout_items_layout_id_publisher_layouts_id_fk"
    FOREIGN KEY ("layout_id") REFERENCES "public"."publisher_layouts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_layout_items" ADD CONSTRAINT "publisher_layout_items_section_id_publisher_layout_sections_id_fk"
    FOREIGN KEY ("section_id") REFERENCES "public"."publisher_layout_sections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
