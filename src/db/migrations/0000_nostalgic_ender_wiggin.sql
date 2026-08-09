CREATE TYPE "public"."article_format" AS ENUM('standard', 'column', 'analysis');--> statement-breakpoint
CREATE TYPE "public"."editor_type" AS ENUM('local', 'national', 'breaking', 'trend', 'influencer', 'event');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video', 'audio');--> statement-breakpoint
CREATE TYPE "public"."news_status" AS ENUM('draft', 'pending', 'published', 'archived', 'banned');--> statement-breakpoint
CREATE TYPE "public"."storage_provider" AS ENUM('firebase', 'r2', 'external');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'author', 'video_editor', 'editor', 'managing_editor', 'super_admin');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"parent_id" varchar(50),
	"icon_name" varchar(50),
	"color" varchar(7),
	"is_standalone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "city_sites" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"slug" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"domain" varchar(255) NOT NULL,
	"province_slug" varchar(50),
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "city_sites_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"code" varchar(2) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"name_local" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"slug" varchar(80) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"province_slug" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"news_id" varchar(64),
	"type" "media_type" NOT NULL,
	"storage_provider" "storage_provider" DEFAULT 'firebase' NOT NULL,
	"storage_key" varchar(500),
	"public_url" text NOT NULL,
	"alt" varchar(300),
	"caption" text,
	"credit" varchar(200),
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"legacy_firestore_id" varchar(64),
	"slug" varchar(300) NOT NULL,
	"title" text NOT NULL,
	"summary" varchar(500),
	"description" text,
	"content" text,
	"html_content" text,
	"status" "news_status" DEFAULT 'draft' NOT NULL,
	"category_id" varchar(50),
	"city_site_id" varchar(50),
	"city_name" varchar(100),
	"city_slug" varchar(50),
	"district_name" varchar(100),
	"district_slug" varchar(80),
	"author_id" varchar(128),
	"author_display_name" varchar(100),
	"source" varchar(200),
	"source_url" text,
	"thumbnail_url" text,
	"cover_image_url" text,
	"video_url" text,
	"tags" text[],
	"views_count" integer DEFAULT 0 NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"saves_count" integer DEFAULT 0 NOT NULL,
	"shares_count" integer DEFAULT 0 NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"editor_type" "editor_type",
	"ai_editor_id" varchar(64),
	"article_format" "article_format",
	"confidence_score" smallint,
	"is_breaking" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_editor_pick" boolean DEFAULT false NOT NULL,
	"seo_title" varchar(200),
	"seo_description" varchar(300),
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_legacy_firestore_id_unique" UNIQUE("legacy_firestore_id"),
	CONSTRAINT "news_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "news_categories" (
	"news_id" varchar(64) NOT NULL,
	"category_id" varchar(50) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_categories_news_id_category_id_pk" PRIMARY KEY("news_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "news_locations" (
	"news_id" varchar(64) NOT NULL,
	"province_slug" varchar(50) NOT NULL,
	"district_slug" varchar(80),
	"lat" real,
	"lng" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_locations_news_id_province_slug_pk" PRIMARY KEY("news_id","province_slug")
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"slug" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"firebase_uid" varchar(128) PRIMARY KEY NOT NULL,
	"email" varchar(255),
	"username" varchar(30),
	"display_name" varchar(100),
	"photo_url" varchar(500),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"home_city_slug" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "city_sites" ADD CONSTRAINT "city_sites_province_slug_provinces_slug_fk" FOREIGN KEY ("province_slug") REFERENCES "public"."provinces"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_province_slug_provinces_slug_fk" FOREIGN KEY ("province_slug") REFERENCES "public"."provinces"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_city_site_id_city_sites_id_fk" FOREIGN KEY ("city_site_id") REFERENCES "public"."city_sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_author_id_users_firebase_uid_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("firebase_uid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_categories" ADD CONSTRAINT "news_categories_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_categories" ADD CONSTRAINT "news_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_locations" ADD CONSTRAINT "news_locations_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_locations" ADD CONSTRAINT "news_locations_province_slug_provinces_slug_fk" FOREIGN KEY ("province_slug") REFERENCES "public"."provinces"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_locations" ADD CONSTRAINT "news_locations_district_slug_districts_slug_fk" FOREIGN KEY ("district_slug") REFERENCES "public"."districts"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provinces" ADD CONSTRAINT "provinces_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_news_idx" ON "media" USING btree ("news_id");--> statement-breakpoint
CREATE INDEX "media_provider_idx" ON "media" USING btree ("storage_provider");--> statement-breakpoint
CREATE INDEX "news_status_published_idx" ON "news" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "news_city_slug_idx" ON "news" USING btree ("city_slug");--> statement-breakpoint
CREATE INDEX "news_category_idx" ON "news" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "news_city_site_idx" ON "news" USING btree ("city_site_id");--> statement-breakpoint
CREATE INDEX "news_author_idx" ON "news" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "news_created_at_idx" ON "news" USING btree ("created_at");