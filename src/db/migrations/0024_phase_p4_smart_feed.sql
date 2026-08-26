-- Phase P4 — Smart Feed seen engine (ADDITIVE ONLY).
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_content_impressions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" varchar(128),
  "session_id" varchar(64),
  "article_id" varchar(64) NOT NULL,
  "cluster_id" varchar(64),
  "publisher_id" varchar(64),
  "feed_type" varchar(32) NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "impression_count" integer DEFAULT 1 NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_content_impressions_user_article_idx"
  ON "user_content_impressions" USING btree ("user_id", "article_id", "feed_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_content_impressions_session_article_idx"
  ON "user_content_impressions" USING btree ("session_id", "article_id", "feed_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_content_impressions_cluster_user_idx"
  ON "user_content_impressions" USING btree ("user_id", "cluster_id")
  WHERE "cluster_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_content_impressions_article_idx"
  ON "user_content_impressions" USING btree ("article_id", "last_seen_at" DESC);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_content_impressions" ADD CONSTRAINT "user_content_impressions_user_id_users_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_content_impressions" ADD CONSTRAINT "user_content_impressions_article_id_news_fk"
    FOREIGN KEY ("article_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
