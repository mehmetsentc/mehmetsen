-- Phase P1 — Publisher Platform (ADDITIVE ONLY).
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publishers" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "name" varchar(200) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "display_name" varchar(200) NOT NULL,
  "publisher_type" varchar(32) DEFAULT 'NEWS_ORGANIZATION' NOT NULL,
  "status" varchar(24) DEFAULT 'UNCLAIMED' NOT NULL,
  "description" text,
  "logo_url" text,
  "cover_image_url" text,
  "website_url" text,
  "primary_domain" varchar(255),
  "country_code" varchar(2),
  "city" varchar(100),
  "district" varchar(100),
  "verification_status" varchar(24) DEFAULT 'UNVERIFIED' NOT NULL,
  "claimed_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "publishers_slug_uidx" ON "publishers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishers_primary_domain_idx" ON "publishers" USING btree ("primary_domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishers_status_idx" ON "publishers" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishers_verification_status_idx" ON "publishers" USING btree ("verification_status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_sources" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "source_id" varchar(64) NOT NULL,
  "relationship_type" varchar(24) DEFAULT 'PRIMARY' NOT NULL,
  "is_primary" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "publisher_sources_source_uidx" ON "publisher_sources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_sources_publisher_idx" ON "publisher_sources" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_sources_source_idx" ON "publisher_sources" USING btree ("source_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_sources" ADD CONSTRAINT "publisher_sources_publisher_id_publishers_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_sources" ADD CONSTRAINT "publisher_sources_source_id_news_sources_id_fk"
    FOREIGN KEY ("source_id") REFERENCES "public"."news_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_members" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "user_id" varchar(128) NOT NULL,
  "role" varchar(24) DEFAULT 'VIEWER' NOT NULL,
  "status" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
  "invited_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "publisher_members_publisher_user_uidx" ON "publisher_members" USING btree ("publisher_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_members_publisher_idx" ON "publisher_members" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_members_user_idx" ON "publisher_members" USING btree ("user_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_members" ADD CONSTRAINT "publisher_members_publisher_id_publishers_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_members" ADD CONSTRAINT "publisher_members_user_id_users_firebase_uid_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_claim_requests" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "user_id" varchar(128) NOT NULL,
  "claim_type" varchar(24) DEFAULT 'OWNERSHIP' NOT NULL,
  "status" varchar(24) DEFAULT 'PENDING' NOT NULL,
  "requested_domain" varchar(255),
  "business_email" varchar(255),
  "verification_method" varchar(24),
  "verification_payload" jsonb,
  "reviewed_by" varchar(128),
  "reviewed_at" timestamp with time zone,
  "rejection_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "publisher_claim_requests_publisher_idx" ON "publisher_claim_requests" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_claim_requests_user_idx" ON "publisher_claim_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_claim_requests_status_idx" ON "publisher_claim_requests" USING btree ("status");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_claim_requests" ADD CONSTRAINT "publisher_claim_requests_publisher_id_publishers_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_claim_requests" ADD CONSTRAINT "publisher_claim_requests_user_id_users_firebase_uid_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
