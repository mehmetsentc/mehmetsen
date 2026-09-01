import { sql } from 'drizzle-orm'
import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core'
import { newsSources } from './crawler'
import { users } from './users'

export const publishers = pgTable(
  'publishers',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    publisherType: varchar('publisher_type', { length: 32 }).default('NEWS_ORGANIZATION').notNull(),
    status: varchar('status', { length: 24 }).default('UNCLAIMED').notNull(),
    description: text('description'),
    logoUrl: text('logo_url'),
    coverImageUrl: text('cover_image_url'),
    websiteUrl: text('website_url'),
    primaryDomain: varchar('primary_domain', { length: 255 }),
    countryCode: varchar('country_code', { length: 2 }),
    city: varchar('city', { length: 100 }),
    district: varchar('district', { length: 100 }),
    verificationStatus: varchar('verification_status', { length: 24 }).default('UNCLAIMED').notNull(),
    /** LP6 Publisher Themes — curated palette only, see src/lib/publisher/accentPalette.ts. Null = NaHaber default (no accent). */
    accentColorHex: varchar('accent_color_hex', { length: 7 }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('publishers_slug_uidx').on(t.slug),
    index('publishers_primary_domain_idx').on(t.primaryDomain),
    index('publishers_status_idx').on(t.status),
    index('publishers_verification_status_idx').on(t.verificationStatus),
  ]
)

export const publisherSources = pgTable(
  'publisher_sources',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    sourceId: varchar('source_id', { length: 64 })
      .notNull()
      .references(() => newsSources.id, { onDelete: 'cascade' }),
    relationshipType: varchar('relationship_type', { length: 24 }).default('PRIMARY').notNull(),
    isPrimary: boolean('is_primary').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('publisher_sources_source_uidx').on(t.sourceId),
    index('publisher_sources_publisher_idx').on(t.publisherId),
    index('publisher_sources_source_idx').on(t.sourceId),
  ]
)

export const publisherMembers = pgTable(
  'publisher_members',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    role: varchar('role', { length: 24 }).default('VIEWER').notNull(),
    status: varchar('status', { length: 24 }).default('ACTIVE').notNull(),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('publisher_members_publisher_user_uidx').on(t.publisherId, t.userId),
    uniqueIndex('publisher_members_one_active_owner_uidx')
      .on(t.publisherId)
      .where(sql`${t.role} = 'OWNER' AND ${t.status} = 'ACTIVE'`),
    index('publisher_members_publisher_idx').on(t.publisherId),
    index('publisher_members_user_idx').on(t.userId),
  ]
)

export const publisherClaimRequests = pgTable(
  'publisher_claim_requests',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    claimType: varchar('claim_type', { length: 24 }).default('OWNERSHIP').notNull(),
    status: varchar('status', { length: 24 }).default('PENDING').notNull(),
    requestedDomain: varchar('requested_domain', { length: 255 }),
    businessEmail: varchar('business_email', { length: 255 }),
    verificationMethod: varchar('verification_method', { length: 24 }),
    verificationPayload: jsonb('verification_payload').$type<Record<string, unknown>>(),
    reviewedBy: varchar('reviewed_by', { length: 128 }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('publisher_claim_requests_publisher_idx').on(t.publisherId),
    index('publisher_claim_requests_user_idx').on(t.userId),
    index('publisher_claim_requests_status_idx').on(t.status),
  ]
)
