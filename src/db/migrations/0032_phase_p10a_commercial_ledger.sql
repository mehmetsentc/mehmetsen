-- Phase P10A — Commercial ledger + commission + payment state machine (ADDITIVE ONLY).
-- No real payment provider / Stripe / iyzico / payout / ad serving.
--> statement-breakpoint

-- Extend booking with immutable commercial snapshot + richer status vocabulary.
ALTER TABLE "ad_bookings" ADD COLUMN IF NOT EXISTS "gross_amount_minor" bigint;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD COLUMN IF NOT EXISTS "platform_commission_rate_bps" integer;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD COLUMN IF NOT EXISTS "platform_commission_minor" bigint;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD COLUMN IF NOT EXISTS "publisher_gross_minor" bigint;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD COLUMN IF NOT EXISTS "publisher_net_minor" bigint;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD COLUMN IF NOT EXISTS "tax_placeholder_minor" bigint;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD COLUMN IF NOT EXISTS "invoice_status" varchar(32);--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD COLUMN IF NOT EXISTS "tax_profile_id" varchar(64);--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD COLUMN IF NOT EXISTS "commercial_snapshot_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_bookings" ADD COLUMN IF NOT EXISTS "commercial_frozen" boolean DEFAULT false NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "booking_id" varchar(64) NOT NULL,
  "advertiser_id" varchar(64) NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) DEFAULT 'TRY' NOT NULL,
  "status" varchar(32) DEFAULT 'PENDING' NOT NULL,
  "provider" varchar(16) DEFAULT 'NONE' NOT NULL,
  "provider_reference" varchar(128),
  "idempotency_key" varchar(128) NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "payment_intents_booking_status_idx"
  ON "payment_intents" USING btree ("booking_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intents_advertiser_idx"
  ON "payment_intents" USING btree ("advertiser_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_idempotency_uidx"
  ON "payment_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_one_active_booking_uidx"
  ON "payment_intents" ("booking_id")
  WHERE "status" IN ('PENDING', 'REQUIRES_PAYMENT', 'PROCESSING');--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_booking_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."ad_bookings"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payment_transactions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "payment_intent_id" varchar(64) NOT NULL,
  "provider" varchar(16) NOT NULL,
  "provider_transaction_id" varchar(128),
  "transaction_type" varchar(24) NOT NULL,
  "status" varchar(24) NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) DEFAULT 'TRY' NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "payment_transactions_intent_idx"
  ON "payment_transactions" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_idempotency_uidx"
  ON "payment_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_provider_txn_uidx"
  ON "payment_transactions" ("provider", "provider_transaction_id")
  WHERE "provider_transaction_id" IS NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_intent_id_fk"
    FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "commercial_ledger_entries" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "transaction_id" varchar(64) NOT NULL,
  "booking_id" varchar(64) NOT NULL,
  "payment_intent_id" varchar(64),
  "account_type" varchar(40) NOT NULL,
  "account_id" varchar(64),
  "entry_type" varchar(40) NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) DEFAULT 'TRY' NOT NULL,
  "direction" varchar(8) NOT NULL,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cle_booking_created_idx"
  ON "commercial_ledger_entries" USING btree ("booking_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cle_transaction_idx"
  ON "commercial_ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cle_payment_intent_idx"
  ON "commercial_ledger_entries" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cle_account_idx"
  ON "commercial_ledger_entries" USING btree ("account_type", "account_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "commercial_ledger_entries" ADD CONSTRAINT "cle_booking_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."ad_bookings"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "publisher_earnings" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "publisher_id" varchar(64) NOT NULL,
  "booking_id" varchar(64) NOT NULL,
  "payment_intent_id" varchar(64),
  "ledger_transaction_id" varchar(64) NOT NULL,
  "gross_minor" bigint NOT NULL,
  "net_minor" bigint NOT NULL,
  "currency" varchar(3) DEFAULT 'TRY' NOT NULL,
  "status" varchar(24) DEFAULT 'PENDING' NOT NULL,
  "commission_status" varchar(32) DEFAULT 'PENDING_COMMISSION' NOT NULL,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "publisher_earnings_pub_status_idx"
  ON "publisher_earnings" USING btree ("publisher_id", "status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_earnings_booking_idx"
  ON "publisher_earnings" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "publisher_earnings_booking_active_uidx"
  ON "publisher_earnings" ("booking_id")
  WHERE "status" IN ('PENDING', 'AVAILABLE', 'PAID');--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_earnings" ADD CONSTRAINT "publisher_earnings_publisher_id_fk"
    FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "publisher_earnings" ADD CONSTRAINT "publisher_earnings_booking_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."ad_bookings"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "commercial_audit_events" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "actor_user_id" varchar(128),
  "advertiser_id" varchar(64),
  "publisher_id" varchar(64),
  "booking_id" varchar(64),
  "entity_type" varchar(32),
  "entity_id" varchar(64),
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cae_event_idx"
  ON "commercial_audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cae_booking_idx"
  ON "commercial_audit_events" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cae_entity_idx"
  ON "commercial_audit_events" USING btree ("entity_type", "entity_id");
