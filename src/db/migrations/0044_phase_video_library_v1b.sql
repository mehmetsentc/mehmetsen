-- Phase V1B — Video Library import jobs (ADDITIVE ONLY).
-- Does not apply 0040/0042. Does not rewrite V1A 0043 numbering.
--> statement-breakpoint

ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "import_error_code" varchar(64);--> statement-breakpoint
ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "import_error_message" varchar(300);--> statement-breakpoint
ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "last_import_job_id" varchar(64);--> statement-breakpoint

ALTER TABLE "video_library_jobs"
  ADD COLUMN IF NOT EXISTS "error_code" varchar(64);--> statement-breakpoint
ALTER TABLE "video_library_jobs"
  ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vlj_one_active_download_uidx"
  ON "video_library_jobs" ("item_id", "kind")
  WHERE "status" IN ('QUEUED', 'RUNNING', 'PENDING');
