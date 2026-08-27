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

/** Editorial content items — separate from raw_articles / published news. */
export const publisherContentItems = pgTable(
  'publisher_content_items',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    sourceMode: varchar('source_mode', { length: 24 }).default('MANUAL').notNull(),
    title: text('title').default('').notNull(),
    spot: text('spot'),
    summary: text('summary'),
    bodyBlocks: jsonb('body_blocks').$type<unknown[]>().default([]).notNull(),
    bodyHtml: text('body_html'),
    categoryId: varchar('category_id', { length: 50 }),
    citySlug: varchar('city_slug', { length: 50 }),
    districtSlug: varchar('district_slug', { length: 80 }),
    cityName: varchar('city_name', { length: 100 }),
    districtName: varchar('district_name', { length: 100 }),
    heroImageUrl: text('hero_image_url'),
    videoUrl: text('video_url'),
    /** Hero / gallery media metadata (alt, credit, caption, mime, size, provider). */
    mediaMeta: jsonb('media_meta').$type<Record<string, unknown> | null>(),
    tags: text('tags').array(),
    seoTitle: varchar('seo_title', { length: 200 }),
    seoDescription: varchar('seo_description', { length: 300 }),
    seoSlug: varchar('seo_slug', { length: 300 }),
    isBreaking: boolean('is_breaking').default(false).notNull(),
    rightsStatus: varchar('rights_status', { length: 32 }).default('UNKNOWN').notNull(),
    rightsBasis: varchar('rights_basis', { length: 64 }).default('UNKNOWN').notNull(),
    sourceUrl: text('source_url'),
    originalSourceId: varchar('original_source_id', { length: 64 }),
    crawlerRawArticleId: varchar('crawler_raw_article_id', { length: 64 }),
    crawlerClusterId: varchar('crawler_cluster_id', { length: 64 }),
    publishedNewsId: varchar('published_news_id', { length: 64 }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    scheduleTimezone: varchar('schedule_timezone', { length: 64 }).default('Europe/Istanbul'),
    scheduleClaimedAt: timestamp('schedule_claimed_at', { withTimezone: true }),
    scheduleClaimedBy: varchar('schedule_claimed_by', { length: 128 }),
    scheduleClaimExpiresAt: timestamp('schedule_claim_expires_at', { withTimezone: true }),
    publicationStatus: varchar('publication_status', { length: 24 }).default('NONE').notNull(),
    firestoreStatus: varchar('firestore_status', { length: 24 }).default('NONE').notNull(),
    postgresStatus: varchar('postgres_status', { length: 24 }).default('NONE').notNull(),
    publicationAttempts: integer('publication_attempts').default(0).notNull(),
    publicationLastError: text('publication_last_error'),
    publicationClaimedAt: timestamp('publication_claimed_at', { withTimezone: true }),
    publicationClaimedBy: varchar('publication_claimed_by', { length: 128 }),
    reviewNote: text('review_note'),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    updatedBy: varchar('updated_by', { length: 128 }),
    approvedBy: varchar('approved_by', { length: 128 }),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('pci_publisher_status_updated_idx').on(t.publisherId, t.status, t.updatedAt),
    index('pci_publisher_author_updated_idx').on(t.publisherId, t.createdBy, t.updatedAt),
    index('pci_publisher_scheduled_idx').on(t.publisherId, t.scheduledAt),
    index('pci_published_news_idx').on(t.publishedNewsId),
    index('pci_raw_article_idx').on(t.crawlerRawArticleId),
    index('pci_schedule_due_idx').on(t.status, t.scheduledAt),
    index('pci_publication_partial_idx').on(t.publicationStatus, t.updatedAt),
    uniqueIndex('pci_one_published_news_uidx')
      .on(t.publishedNewsId)
      .where(sql`${t.publishedNewsId} IS NOT NULL`),
    uniqueIndex('pci_publisher_raw_article_uidx')
      .on(t.publisherId, t.crawlerRawArticleId)
      .where(sql`${t.crawlerRawArticleId} IS NOT NULL`),
  ]
)

export const publisherContentRevisions = pgTable(
  'publisher_content_revisions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    contentId: varchar('content_id', { length: 64 })
      .notNull()
      .references(() => publisherContentItems.id, { onDelete: 'cascade' }),
    revisionNumber: integer('revision_number').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    changeKind: varchar('change_kind', { length: 48 }).notNull(),
    note: text('note'),
    createdBy: varchar('created_by', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('pcr_content_revision_uidx').on(t.contentId, t.revisionNumber),
    index('pcr_content_idx').on(t.contentId),
  ]
)

export const publisherContentAudit = pgTable(
  'publisher_content_audit',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    contentId: varchar('content_id', { length: 64 })
      .notNull()
      .references(() => publisherContentItems.id, { onDelete: 'cascade' }),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    actorUserId: varchar('actor_user_id', { length: 128 }),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('pca_content_idx').on(t.contentId),
    index('pca_publisher_idx').on(t.publisherId),
    index('pca_event_idx').on(t.eventType),
    index('pca_publisher_content_created_idx').on(t.publisherId, t.contentId, t.createdAt),
  ]
)
