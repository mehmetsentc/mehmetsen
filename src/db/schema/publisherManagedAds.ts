import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
} from 'drizzle-orm/pg-core'
import { publishers } from './publishers'
import { publisherAdInventory } from './publisherAdInventory'

/** Publisher self-managed ads — Phase P10 (no payment). */
export const publisherManagedAds = pgTable(
  'publisher_managed_ads',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    inventoryId: varchar('inventory_id', { length: 64 })
      .notNull()
      .references(() => publisherAdInventory.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    advertiserName: varchar('advertiser_name', { length: 160 }).notNull(),
    advertiserId: varchar('advertiser_id', { length: 64 }),
    status: varchar('status', { length: 24 }).default('DRAFT').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    destinationUrl: text('destination_url'),
    internalNote: text('internal_note'),
    sourceType: varchar('source_type', { length: 24 }).default('SELF_MANAGED').notNull(),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    updatedBy: varchar('updated_by', { length: 128 }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('pma_publisher_status_time_idx').on(t.publisherId, t.status, t.startAt, t.endAt),
    index('pma_inventory_time_idx').on(t.inventoryId, t.startAt, t.endAt),
    index('pma_publisher_updated_idx').on(t.publisherId, t.updatedAt),
  ]
)

export const publisherAdCreatives = pgTable(
  'publisher_ad_creatives',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    adId: varchar('ad_id', { length: 64 })
      .notNull()
      .references(() => publisherManagedAds.id, { onDelete: 'cascade' }),
    creativeType: varchar('creative_type', { length: 32 }).notNull(),
    mediaUrl: text('media_url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    headline: varchar('headline', { length: 200 }),
    body: text('body'),
    altText: varchar('alt_text', { length: 300 }),
    durationSeconds: integer('duration_seconds'),
    version: integer('version').default(1).notNull(),
    isCurrent: boolean('is_current').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('pac_ad_idx').on(t.adId),
    index('pac_ad_current_idx').on(t.adId, t.isCurrent),
    index('pac_publisher_idx').on(t.publisherId),
  ]
)

export const publisherAdImpressions = pgTable(
  'publisher_ad_impressions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    adId: varchar('ad_id', { length: 64 }).notNull(),
    creativeId: varchar('creative_id', { length: 64 }).notNull(),
    inventoryId: varchar('inventory_id', { length: 64 }).notNull(),
    publisherId: varchar('publisher_id', { length: 64 }).notNull(),
    userId: varchar('user_id', { length: 128 }),
    sessionId: varchar('session_id', { length: 128 }),
    deviceClass: varchar('device_class', { length: 24 }),
    referrerType: varchar('referrer_type', { length: 32 }),
    dedupeKey: varchar('dedupe_key', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('pai_imp_ad_created_idx').on(t.adId, t.createdAt),
    index('pai_imp_publisher_created_idx').on(t.publisherId, t.createdAt),
  ]
)

export const publisherAdClicks = pgTable(
  'publisher_ad_clicks',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    adId: varchar('ad_id', { length: 64 }).notNull(),
    creativeId: varchar('creative_id', { length: 64 }),
    inventoryId: varchar('inventory_id', { length: 64 }).notNull(),
    publisherId: varchar('publisher_id', { length: 64 }).notNull(),
    impressionId: varchar('impression_id', { length: 64 }),
    userId: varchar('user_id', { length: 128 }),
    sessionId: varchar('session_id', { length: 128 }),
    destinationUrlSnapshot: text('destination_url_snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('paclick_ad_created_idx').on(t.adId, t.createdAt),
    index('paclick_publisher_created_idx').on(t.publisherId, t.createdAt),
  ]
)
