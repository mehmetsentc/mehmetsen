CREATE TABLE IF NOT EXISTS "crawler_ops_state" (
  "id" varchar(32) PRIMARY KEY NOT NULL,
  "maintenance_mode" varchar(24) DEFAULT 'IDLE' NOT NULL,
  "rebuild_status" varchar(32) DEFAULT 'IDLE' NOT NULL,
  "rebuild_window_hours" integer DEFAULT 24 NOT NULL,
  "cutoff_at" timestamp with time zone,
  "rebuild_started_at" timestamp with time zone,
  "rebuild_finished_at" timestamp with time zone,
  "plan_hash" varchar(64),
  "last_error" text,
  "discovered" integer DEFAULT 0 NOT NULL,
  "pending" integer DEFAULT 0 NOT NULL,
  "extracted" integer DEFAULT 0 NOT NULL,
  "failed" integer DEFAULT 0 NOT NULL,
  "events" integer DEFAULT 0 NOT NULL,
  "multi_source" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "crawler_ops_state" ("id") VALUES ('global') ON CONFLICT ("id") DO NOTHING;
