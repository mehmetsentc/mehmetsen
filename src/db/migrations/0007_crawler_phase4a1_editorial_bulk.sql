ALTER TABLE "raw_articles" ALTER COLUMN "editorial_status" TYPE varchar(24);--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "rejection_reason" varchar(40);--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "rejection_note" text;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "raw_articles" ADD COLUMN IF NOT EXISTS "rejected_by" varchar(128);--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "editorial_decision" varchar(24) DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "editorial_decision_reason" text;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "editorial_decision_note" text;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "editorial_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "editorial_decided_by" varchar(128);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_clusters_editorial_decision_idx" ON "news_clusters" USING btree ("editorial_decision");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_editorial_audit" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "actor_id" varchar(128) NOT NULL,
  "actor_email" varchar(255),
  "actor_role" varchar(32) NOT NULL,
  "action" varchar(40) NOT NULL,
  "entity_type" varchar(24) NOT NULL,
  "entity_id" varchar(64),
  "affected_count" integer DEFAULT 0 NOT NULL,
  "skipped_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "reason" varchar(80),
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_editorial_audit_created_idx" ON "crawler_editorial_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_editorial_audit_actor_idx" ON "crawler_editorial_audit" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_editorial_audit_entity_idx" ON "crawler_editorial_audit" USING btree ("entity_type", "entity_id");
