import { sql } from 'drizzle-orm'
import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core'
import { publishers } from './publishers'

export const publisherLayouts = pgTable(
  'publisher_layouts',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).default('Ana Sayfa').notNull(),
    status: varchar('status', { length: 24 }).default('DRAFT').notNull(),
    themeKey: varchar('theme_key', { length: 32 }).default('MODERN').notNull(),
    version: integer('version').default(1).notNull(),
    createdBy: varchar('created_by', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    index('publisher_layouts_publisher_idx').on(t.publisherId),
    index('publisher_layouts_status_idx').on(t.status),
    uniqueIndex('publisher_layouts_one_draft_uidx')
      .on(t.publisherId)
      .where(sql`${t.status} = 'DRAFT'`),
    uniqueIndex('publisher_layouts_one_published_uidx')
      .on(t.publisherId)
      .where(sql`${t.status} = 'PUBLISHED'`),
  ]
)

export const publisherLayoutSections = pgTable(
  'publisher_layout_sections',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    layoutId: varchar('layout_id', { length: 64 })
      .notNull()
      .references(() => publisherLayouts.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    sectionType: varchar('section_type', { length: 32 }).default('CUSTOM').notNull(),
    position: integer('position').default(0).notNull(),
    displayStyle: varchar('display_style', { length: 32 }).default('GRID').notNull(),
    isVisible: boolean('is_visible').default(true).notNull(),
    contentMode: varchar('content_mode', { length: 16 }).default('MANUAL').notNull(),
    autoConfig: jsonb('auto_config').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('publisher_layout_sections_layout_idx').on(t.layoutId),
    uniqueIndex('publisher_layout_sections_layout_slug_uidx').on(t.layoutId, t.slug),
  ]
)

export const publisherLayoutItems = pgTable(
  'publisher_layout_items',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    layoutId: varchar('layout_id', { length: 64 })
      .notNull()
      .references(() => publisherLayouts.id, { onDelete: 'cascade' }),
    sectionId: varchar('section_id', { length: 64 })
      .notNull()
      .references(() => publisherLayoutSections.id, { onDelete: 'cascade' }),
    itemType: varchar('item_type', { length: 24 }).default('ARTICLE').notNull(),
    contentId: varchar('content_id', { length: 128 }),
    position: integer('position').default(0).notNull(),
    size: varchar('size', { length: 24 }).default('STANDARD').notNull(),
    span: integer('span').default(4).notNull(),
    presentation: jsonb('presentation').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('publisher_layout_items_layout_idx').on(t.layoutId),
    index('publisher_layout_items_section_idx').on(t.sectionId),
    uniqueIndex('publisher_layout_items_article_once_uidx')
      .on(t.layoutId, t.contentId)
      .where(sql`${t.itemType} = 'ARTICLE' AND ${t.contentId} IS NOT NULL`),
  ]
)
