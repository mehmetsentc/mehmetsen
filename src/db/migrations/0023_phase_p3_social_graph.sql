-- Phase P3 — Social Graph + User Profiles (ADDITIVE ONLY).
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_profiles" (
  "firebase_uid" varchar(128) PRIMARY KEY NOT NULL,
  "username" varchar(30),
  "display_name" varchar(100),
  "avatar_url" varchar(500),
  "bio" varchar(500),
  "city" varchar(100),
  "country" varchar(2),
  "profile_visibility" varchar(16) DEFAULT 'PUBLIC' NOT NULL,
  "actor_type" varchar(16) DEFAULT 'HUMAN' NOT NULL,
  "liked_visibility" varchar(16) DEFAULT 'PRIVATE' NOT NULL,
  "saved_visibility" varchar(16) DEFAULT 'PRIVATE' NOT NULL,
  "interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "username_changed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_username_uidx"
  ON "user_profiles" ("username")
  WHERE "username" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_profiles_city_idx" ON "user_profiles" USING btree ("city");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_firebase_uid_users_fk"
    FOREIGN KEY ("firebase_uid") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_publisher_follows" (
  "user_id" varchar(128) NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_publisher_follows_pk" PRIMARY KEY ("user_id", "publisher_id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_publisher_follows_publisher_idx"
  ON "user_publisher_follows" USING btree ("publisher_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_publisher_follows_user_idx"
  ON "user_publisher_follows" USING btree ("user_id", "created_at" DESC);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_publisher_follows" ADD CONSTRAINT "user_publisher_follows_user_id_users_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_publisher_follows" ADD CONSTRAINT "user_publisher_follows_publisher_id_publishers_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "article_likes" (
  "user_id" varchar(128) NOT NULL,
  "article_id" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "article_likes_pk" PRIMARY KEY ("user_id", "article_id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "article_likes_article_idx"
  ON "article_likes" USING btree ("article_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_likes_user_idx"
  ON "article_likes" USING btree ("user_id", "created_at" DESC);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "article_likes" ADD CONSTRAINT "article_likes_user_id_users_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "article_likes" ADD CONSTRAINT "article_likes_article_id_news_fk"
    FOREIGN KEY ("article_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "saved_articles" (
  "user_id" varchar(128) NOT NULL,
  "article_id" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "saved_articles_pk" PRIMARY KEY ("user_id", "article_id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "saved_articles_user_idx"
  ON "saved_articles" USING btree ("user_id", "created_at" DESC);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_user_id_users_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_article_id_news_fk"
    FOREIGN KEY ("article_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "article_comments" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "article_id" varchar(64) NOT NULL,
  "user_id" varchar(128) NOT NULL,
  "parent_id" varchar(64),
  "content" text NOT NULL,
  "status" varchar(24) DEFAULT 'VISIBLE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "article_comments_article_idx"
  ON "article_comments" USING btree ("article_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_comments_user_idx"
  ON "article_comments" USING btree ("user_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_comments_parent_idx"
  ON "article_comments" USING btree ("parent_id")
  WHERE "parent_id" IS NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_article_id_news_fk"
    FOREIGN KEY ("article_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_user_id_users_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("firebase_uid") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_parent_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "public"."article_comments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "social_events" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "event_type" varchar(48) NOT NULL,
  "user_id" varchar(128),
  "target_type" varchar(24),
  "target_id" varchar(128),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "social_events_type_idx"
  ON "social_events" USING btree ("event_type", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_events_user_idx"
  ON "social_events" USING btree ("user_id", "created_at" DESC);
