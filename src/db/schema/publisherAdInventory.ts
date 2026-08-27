import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  bigint,
  index,
  jsonb,
} from 'drizzle-orm/pg-core'
import { publishers } from './publishers'

/** Sellable ad inventory / slots — Phase P8 (no bookings/campaigns/revenue). */
export const publisherAdInventory = pgTable(
  'publisher_ad_inventory',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    inventoryType: varchar('inventory_type', { length: 24 }).notNull(),
    placementScope: varchar('placement_scope', { length: 40 }).notNull(),
    format: varchar('format', { length: 32 }).notNull(),
    semanticSize: varchar('semantic_size', { length: 24 }).default('STANDARD').notNull(),
    status: varchar('status', { length: 24 }).default('ACTIVE').notNull(),
    saleStatus: varchar('sale_status', { length: 24 }).default('NOT_FOR_SALE').notNull(),
    pricingModel: varchar('pricing_model', { length: 32 }).notNull(),
    priceMinor: bigint('price_minor', { mode: 'number' }),
    currency: varchar('currency', { length: 3 }).default('TRY').notNull(),
    periodDays: integer('period_days'),
    impressionCap: integer('impression_cap'),
    ownershipType: varchar('ownership_type', { length: 24 }).default('PUBLISHER').notNull(),
    isPubliclyListed: boolean('is_publicly_listed').default(false).notNull(),
    layoutItemId: varchar('layout_item_id', { length: 64 }),
    articlePolicy: varchar('article_policy', { length: 24 }),
    previewNote: text('preview_note'),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    updatedBy: varchar('updated_by', { length: 128 }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('pai_publisher_status_idx').on(t.publisherId, t.status),
    index('pai_publisher_sale_idx').on(t.publisherId, t.saleStatus),
    index('pai_publisher_type_idx').on(t.publisherId, t.inventoryType),
    index('pai_public_listing_idx').on(t.isPubliclyListed, t.saleStatus, t.status),
    index('pai_layout_item_idx').on(t.layoutItemId),
  ]
)

export const publisherAdInventoryAudit = pgTable(
  'publisher_ad_inventory_audit',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    inventoryId: varchar('inventory_id', { length: 64 })
      .notNull()
      .references(() => publisherAdInventory.id, { onDelete: 'cascade' }),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    actorUserId: varchar('actor_user_id', { length: 128 }),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('paia_inventory_idx').on(t.inventoryId),
    index('paia_publisher_idx').on(t.publisherId),
    index('paia_event_idx').on(t.eventType),
  ]
)
