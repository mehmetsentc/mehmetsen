-- Phase P5 — Smart Feed Ranking v1 (ADDITIVE ONLY).
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_interest_scores" (
  "user_id" varchar(128) NOT NULL,
  "interest_key" varchar(64) NOT NULL,
  "score" real DEFAULT 0 NOT NULL,
  "source" varchar(16) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_interest_scores_pk" PRIMARY KEY ("user_id", "interest_key", "source")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_interest_scores_user_source_idx"
  ON "user_interest_scores" USING btree ("user_id", "source", "score" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_interest_scores_interest_idx"
  ON "user_interest_scores" USING btree ("interest_key", "score" DESC);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_interest_scores" ADD CONSTRAINT "user_interest_scores_user_id_users_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_publisher_affinity" (
  "user_id" varchar(128) NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "score" real DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_publisher_affinity_pk" PRIMARY KEY ("user_id", "publisher_id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_publisher_affinity_user_score_idx"
  ON "user_publisher_affinity" USING btree ("user_id", "score" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_publisher_affinity_publisher_idx"
  ON "user_publisher_affinity" USING btree ("publisher_id", "score" DESC);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_publisher_affinity" ADD CONSTRAINT "user_publisher_affinity_user_id_users_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_publisher_affinity" ADD CONSTRAINT "user_publisher_affinity_publisher_id_publishers_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_feed_preferences" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" varchar(128) NOT NULL,
  "preference_type" varchar(32) NOT NULL,
  "target_type" varchar(24) NOT NULL,
  "target_id" varchar(128) NOT NULL,
  "modifier" real DEFAULT -1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_feed_preferences_user_type_idx"
  ON "user_feed_preferences" USING btree ("user_id", "preference_type", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_feed_preferences_target_idx"
  ON "user_feed_preferences" USING btree ("target_type", "target_id", "user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_feed_preferences_user_target_uidx"
  ON "user_feed_preferences" ("user_id", "preference_type", "target_type", "target_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_feed_preferences" ADD CONSTRAINT "user_feed_preferences_user_id_users_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
