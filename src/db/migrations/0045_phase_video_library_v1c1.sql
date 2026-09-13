-- Phase V1C.1 — playback/poster authority columns (ADDITIVE ONLY).
-- Does not apply 0040/0042. Does not rewrite V1A/V1B numbering.
--> statement-breakpoint

ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "playback_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "playback_file_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "video_codec" varchar(64);--> statement-breakpoint
ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "audio_codec" varchar(64);--> statement-breakpoint
ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "fps" real;--> statement-breakpoint
ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "process_error_code" varchar(64);--> statement-breakpoint
ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "process_error_message" varchar(300);--> statement-breakpoint
ALTER TABLE "video_library_items"
  ADD COLUMN IF NOT EXISTS "last_process_job_id" varchar(64);
