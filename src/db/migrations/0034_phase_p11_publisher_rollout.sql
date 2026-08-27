-- Phase P11 — Publisher feature allowlist for controlled rollout (ADDITIVE).
-- Enables Studio/Content/Ads for selected publishers without global flags ON.
-- No payment / no mass activation / no DROP/TRUNCATE.
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_feature_access" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "feature_key" varchar(64) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar(128) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" varchar(128),
  "note" text
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "pfa_publisher_feature_uidx"
  ON "publisher_feature_access" USING btree ("publisher_id", "feature_key");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pfa_feature_enabled_idx"
  ON "publisher_feature_access" USING btree ("feature_key", "enabled");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pfa_publisher_idx"
  ON "publisher_feature_access" USING btree ("publisher_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_feature_access" ADD CONSTRAINT "pfa_publisher_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
