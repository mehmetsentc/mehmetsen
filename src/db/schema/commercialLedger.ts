import {
  pgTable,
  varchar,
  timestamp,
  bigint,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { publishers } from './publishers'
import { adBookings } from './advertiserMarketplace'

/** Phase P10A — payment intents (provider NONE | TEST only). */
export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    bookingId: varchar('booking_id', { length: 64 })
      .notNull()
      .references(() => adBookings.id, { onDelete: 'restrict' }),
    advertiserId: varchar('advertiser_id', { length: 64 }).notNull(),
    publisherId: varchar('publisher_id', { length: 64 }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).default('TRY').notNull(),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    provider: varchar('provider', { length: 16 }).default('NONE').notNull(),
    providerReference: varchar('provider_reference', { length: 128 }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('payment_intents_booking_status_idx').on(t.bookingId, t.status),
    index('payment_intents_advertiser_idx').on(t.advertiserId),
    uniqueIndex('payment_intents_idempotency_uidx').on(t.idempotencyKey),
    uniqueIndex('payment_intents_one_active_booking_uidx')
      .on(t.bookingId)
      .where(sql`${t.status} IN ('PENDING', 'REQUIRES_PAYMENT', 'PROCESSING')`),
  ]
)

export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    paymentIntentId: varchar('payment_intent_id', { length: 64 })
      .notNull()
      .references(() => paymentIntents.id, { onDelete: 'restrict' }),
    provider: varchar('provider', { length: 16 }).notNull(),
    providerTransactionId: varchar('provider_transaction_id', { length: 128 }),
    transactionType: varchar('transaction_type', { length: 24 }).notNull(),
    status: varchar('status', { length: 24 }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).default('TRY').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('payment_transactions_intent_idx').on(t.paymentIntentId),
    uniqueIndex('payment_transactions_idempotency_uidx').on(t.idempotencyKey),
    uniqueIndex('payment_transactions_provider_txn_uidx')
      .on(t.provider, t.providerTransactionId)
      .where(sql`${t.providerTransactionId} IS NOT NULL`),
  ]
)

export const commercialLedgerEntries = pgTable(
  'commercial_ledger_entries',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    transactionId: varchar('transaction_id', { length: 64 }).notNull(),
    bookingId: varchar('booking_id', { length: 64 })
      .notNull()
      .references(() => adBookings.id, { onDelete: 'restrict' }),
    paymentIntentId: varchar('payment_intent_id', { length: 64 }),
    accountType: varchar('account_type', { length: 40 }).notNull(),
    accountId: varchar('account_id', { length: 64 }),
    entryType: varchar('entry_type', { length: 40 }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).default('TRY').notNull(),
    direction: varchar('direction', { length: 8 }).notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('cle_booking_created_idx').on(t.bookingId, t.createdAt),
    index('cle_transaction_idx').on(t.transactionId),
    index('cle_payment_intent_idx').on(t.paymentIntentId),
    index('cle_account_idx').on(t.accountType, t.accountId),
  ]
)

export const publisherEarnings = pgTable(
  'publisher_earnings',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    bookingId: varchar('booking_id', { length: 64 })
      .notNull()
      .references(() => adBookings.id, { onDelete: 'restrict' }),
    paymentIntentId: varchar('payment_intent_id', { length: 64 }),
    ledgerTransactionId: varchar('ledger_transaction_id', { length: 64 }).notNull(),
    grossMinor: bigint('gross_minor', { mode: 'number' }).notNull(),
    netMinor: bigint('net_minor', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).default('TRY').notNull(),
    status: varchar('status', { length: 24 }).default('PENDING').notNull(),
    commissionStatus: varchar('commission_status', { length: 32 })
      .default('PENDING_COMMISSION')
      .notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('publisher_earnings_pub_status_idx').on(t.publisherId, t.status, t.createdAt),
    index('publisher_earnings_booking_idx').on(t.bookingId),
    uniqueIndex('publisher_earnings_booking_active_uidx')
      .on(t.bookingId)
      .where(sql`${t.status} IN ('PENDING', 'AVAILABLE', 'PAID')`),
  ]
)

export const commercialAuditEvents = pgTable(
  'commercial_audit_events',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    actorUserId: varchar('actor_user_id', { length: 128 }),
    advertiserId: varchar('advertiser_id', { length: 64 }),
    publisherId: varchar('publisher_id', { length: 64 }),
    bookingId: varchar('booking_id', { length: 64 }),
    entityType: varchar('entity_type', { length: 32 }),
    entityId: varchar('entity_id', { length: 64 }),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('cae_event_idx').on(t.eventType),
    index('cae_booking_idx').on(t.bookingId),
    index('cae_entity_idx').on(t.entityType, t.entityId),
  ]
)
