import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  bigint,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core'
import { publishers } from './publishers'
import { publisherAdInventory } from './publisherAdInventory'

/** Advertiser orgs — Phase P9 (no payment/revenue/serving). */
export const advertisers = pgTable(
  'advertisers',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    advertiserType: varchar('advertiser_type', { length: 24 }).notNull(),
    status: varchar('status', { length: 24 }).default('ACTIVE').notNull(),
    websiteUrl: text('website_url'),
    city: varchar('city', { length: 100 }),
    country: varchar('country', { length: 2 }).default('TR'),
    logoUrl: text('logo_url'),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('advertisers_slug_uidx').on(t.slug),
    index('advertisers_status_idx').on(t.status),
    index('advertisers_city_idx').on(t.city),
  ]
)

export const advertiserMembers = pgTable(
  'advertiser_members',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    advertiserId: varchar('advertiser_id', { length: 64 })
      .notNull()
      .references(() => advertisers.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 128 }).notNull(),
    role: varchar('role', { length: 24 }).notNull(),
    status: varchar('status', { length: 24 }).default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('advertiser_members_adv_user_uidx').on(t.advertiserId, t.userId),
    index('advertiser_members_user_idx').on(t.userId),
    index('advertiser_members_advertiser_idx').on(t.advertiserId),
  ]
)

export const advertiserCampaigns = pgTable(
  'advertiser_campaigns',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    advertiserId: varchar('advertiser_id', { length: 64 })
      .notNull()
      .references(() => advertisers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    objective: varchar('objective', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    budgetMinor: bigint('budget_minor', { mode: 'number' }),
    currency: varchar('currency', { length: 3 }).default('TRY').notNull(),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('advertiser_campaigns_adv_status_upd_idx').on(t.advertiserId, t.status, t.updatedAt)]
)

export const advertiserCreatives = pgTable(
  'advertiser_creatives',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    advertiserId: varchar('advertiser_id', { length: 64 })
      .notNull()
      .references(() => advertisers.id, { onDelete: 'cascade' }),
    campaignId: varchar('campaign_id', { length: 64 }).references(() => advertiserCampaigns.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 200 }).notNull(),
    creativeType: varchar('creative_type', { length: 32 }).notNull(),
    headline: varchar('headline', { length: 200 }),
    body: text('body'),
    mediaUrl: text('media_url'),
    destinationUrl: text('destination_url'),
    status: varchar('status', { length: 24 }).default('DRAFT').notNull(),
    platformModerationStatus: varchar('platform_moderation_status', { length: 24 })
      .default('PENDING')
      .notNull(),
    version: integer('version').default(1).notNull(),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    updatedBy: varchar('updated_by', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('advertiser_creatives_adv_status_idx').on(t.advertiserId, t.status),
    index('advertiser_creatives_campaign_idx').on(t.campaignId),
  ]
)

export const adBookingRequests = pgTable(
  'ad_booking_requests',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    advertiserId: varchar('advertiser_id', { length: 64 })
      .notNull()
      .references(() => advertisers.id, { onDelete: 'cascade' }),
    campaignId: varchar('campaign_id', { length: 64 })
      .notNull()
      .references(() => advertiserCampaigns.id, { onDelete: 'cascade' }),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    inventoryId: varchar('inventory_id', { length: 64 })
      .notNull()
      .references(() => publisherAdInventory.id, { onDelete: 'restrict' }),
    creativeId: varchar('creative_id', { length: 64 }).references(() => advertiserCreatives.id, {
      onDelete: 'set null',
    }),
    status: varchar('status', { length: 24 }).default('DRAFT').notNull(),
    requestedStartAt: timestamp('requested_start_at', { withTimezone: true }).notNull(),
    requestedEndAt: timestamp('requested_end_at', { withTimezone: true }).notNull(),
    requestedImpressions: integer('requested_impressions'),
    priceSnapshotMinor: bigint('price_snapshot_minor', { mode: 'number' }),
    pricingModelSnapshot: varchar('pricing_model_snapshot', { length: 32 }).notNull(),
    durationSnapshot: integer('duration_snapshot'),
    impressionSnapshot: integer('impression_snapshot'),
    currency: varchar('currency', { length: 3 }).default('TRY').notNull(),
    message: text('message'),
    publisherOfferMinor: bigint('publisher_offer_minor', { mode: 'number' }),
    publisherNote: text('publisher_note'),
    creativeReviewStatus: varchar('creative_review_status', { length: 24 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    publisherReviewedBy: varchar('publisher_reviewed_by', { length: 128 }),
    publisherReviewedAt: timestamp('publisher_reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('abr_advertiser_status_idx').on(t.advertiserId, t.status),
    index('abr_publisher_status_idx').on(t.publisherId, t.status),
    index('abr_inventory_dates_idx').on(t.inventoryId, t.requestedStartAt, t.requestedEndAt),
    index('abr_campaign_idx').on(t.campaignId),
  ]
)

export const adBookings = pgTable(
  'ad_bookings',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    bookingRequestId: varchar('booking_request_id', { length: 64 })
      .notNull()
      .references(() => adBookingRequests.id, { onDelete: 'restrict' }),
    advertiserId: varchar('advertiser_id', { length: 64 })
      .notNull()
      .references(() => advertisers.id, { onDelete: 'cascade' }),
    campaignId: varchar('campaign_id', { length: 64 })
      .notNull()
      .references(() => advertiserCampaigns.id, { onDelete: 'cascade' }),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    inventoryId: varchar('inventory_id', { length: 64 })
      .notNull()
      .references(() => publisherAdInventory.id, { onDelete: 'restrict' }),
    creativeId: varchar('creative_id', { length: 64 }),
    creativeSnapshot: jsonb('creative_snapshot').$type<Record<string, unknown>>(),
    status: varchar('status', { length: 24 }).default('PENDING_PAYMENT').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    impressionLimit: integer('impression_limit'),
    priceMinor: bigint('price_minor', { mode: 'number' }),
    currency: varchar('currency', { length: 3 }).default('TRY').notNull(),
    pricingModelSnapshot: varchar('pricing_model_snapshot', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('ad_bookings_request_uidx').on(t.bookingRequestId),
    index('ad_bookings_inventory_dates_status_idx').on(t.inventoryId, t.startAt, t.endAt, t.status),
    index('ad_bookings_publisher_status_idx').on(t.publisherId, t.status),
    index('ad_bookings_advertiser_idx').on(t.advertiserId),
  ]
)

export const marketplaceAuditEvents = pgTable(
  'marketplace_audit_events',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    actorUserId: varchar('actor_user_id', { length: 128 }),
    advertiserId: varchar('advertiser_id', { length: 64 }),
    publisherId: varchar('publisher_id', { length: 64 }),
    entityType: varchar('entity_type', { length: 32 }),
    entityId: varchar('entity_id', { length: 64 }),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('mae_event_idx').on(t.eventType),
    index('mae_advertiser_idx').on(t.advertiserId),
    index('mae_publisher_idx').on(t.publisherId),
    index('mae_entity_idx').on(t.entityType, t.entityId),
  ]
)
