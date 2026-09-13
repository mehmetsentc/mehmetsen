-- Phase V1A — Video Library foundation (ADDITIVE ONLY).
-- Does not alter existing media / news / videoQueue surfaces.
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "video_library_items" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "platform" varchar(32) NOT NULL,
  "platform_video_id" varchar(128),
  "original_url" text NOT NULL,
  "normalized_url" text NOT NULL,
  "source_profile_id" varchar(128),
  "source_username" varchar(200),
  "source_name" varchar(300),
  "source_url" text,
  "title" text DEFAULT '' NOT NULL,
  "description" text,
  "duration_ms" integer,
  "width" integer,
  "height" integer,
  "aspect_ratio" varchar(32),
  "thumbnail_url" text,
  "poster_storage_key" varchar(500),
  "original_storage_key" varchar(500),
  "playback_storage_key" varchar(500),
  "stream_manifest_key" varchar(500),
  "renditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "mime_type" varchar(100),
  "file_size_bytes" bigint,
  "published_at" timestamp with time zone,
  "imported_at" timestamp with time zone,
  "published_news_id" varchar(64),
  "status" varchar(32) DEFAULT 'INSPECTED' NOT NULL,
  "rights_status" varchar(32) DEFAULT 'UNKNOWN' NOT NULL,
  "content_hash" varchar(128),
  "tags" text[],
  "created_by" varchar(128),
  "updated_by" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vli_normalized_url_uidx"
  ON "video_library_items" ("normalized_url");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vli_platform_video_uidx"
  ON "video_library_items" ("platform", "platform_video_id")
  WHERE "platform_video_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vli_content_hash_uidx"
  ON "video_library_items" ("content_hash")
  WHERE "content_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vli_published_news_uidx"
  ON "video_library_items" ("published_news_id")
  WHERE "published_news_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vli_status_imported_idx"
  ON "video_library_items" USING btree ("status", "imported_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vli_platform_idx"
  ON "video_library_items" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vli_rights_idx"
  ON "video_library_items" USING btree ("rights_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vli_created_idx"
  ON "video_library_items" USING btree ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "video_library_collections" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "name" varchar(200) NOT NULL,
  "slug" varchar(200) NOT NULL,
  "description" text,
  "created_by" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vlc_slug_uidx"
  ON "video_library_collections" ("slug");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "video_library_collection_items" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "collection_id" varchar(64) NOT NULL,
  "item_id" varchar(64) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vlci_collection_item_uidx"
  ON "video_library_collection_items" ("collection_id", "item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vlci_item_idx"
  ON "video_library_collection_items" USING btree ("item_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "video_library_collection_items"
    ADD CONSTRAINT "vlci_collection_id_fk"
    FOREIGN KEY ("collection_id") REFERENCES "public"."video_library_collections"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "video_library_collection_items"
    ADD CONSTRAINT "vlci_item_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."video_library_items"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "video_library_jobs" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "item_id" varchar(64) NOT NULL,
  "kind" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "claimed_at" timestamp with time zone,
  "claimed_by" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vlj_status_created_idx"
  ON "video_library_jobs" USING btree ("status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vlj_item_kind_idx"
  ON "video_library_jobs" USING btree ("item_id", "kind");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "video_library_jobs"
    ADD CONSTRAINT "vlj_item_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."video_library_items"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
