ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "editorial_priority" varchar(16) DEFAULT 'NORMAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_clusters" ADD COLUMN IF NOT EXISTS "approval_source" varchar(16);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_clusters_editorial_priority_idx" ON "news_clusters" USING btree ("editorial_priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_clusters_first_seen_idx" ON "news_clusters" USING btree ("first_seen_at");--> statement-breakpoint
ALTER TABLE "crawler_editorial_audit" ADD COLUMN IF NOT EXISTS "previous_state" varchar(40);--> statement-breakpoint
ALTER TABLE "crawler_editorial_audit" ADD COLUMN IF NOT EXISTS "new_state" varchar(40);--> statement-breakpoint
ALTER TABLE "crawler_editorial_audit" ADD COLUMN IF NOT EXISTS "editorial_priority" varchar(16);--> statement-breakpoint
ALTER TABLE "crawler_editorial_audit" ADD COLUMN IF NOT EXISTS "selection_mode" varchar(24);
