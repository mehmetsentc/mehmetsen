-- Phase P14 — User feature allowlist for controlled consumer pilot (ADDITIVE).
-- Enables User Profiles, Social Graph, Smart Feed, and Ranking V1 for pilot cohort without global flags ON.
-- No public metric contamination / no synthetic bots / no DROP/TRUNCATE.
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_feature_access" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" varchar(128) NOT NULL,
  "feature_key" varchar(64) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar(128) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" varchar(128),
  "reason" text
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ufa_user_feature_uidx"
  ON "user_feature_access" USING btree ("user_id", "feature_key");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ufa_feature_enabled_idx"
  ON "user_feature_access" USING btree ("feature_key", "enabled");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ufa_user_idx"
  ON "user_feature_access" USING btree ("user_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_feature_access" ADD CONSTRAINT "ufa_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
