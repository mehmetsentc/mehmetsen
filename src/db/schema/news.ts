import {
  pgTable,
  varchar,
  text,
  boolean,
  integer,
  smallint,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import { users } from './users'
import { categories } from './categories'
import { citySites } from './citySites'

export const newsStatusEnum = pgEnum('news_status', [
  'draft',
  'pending',
  'published',
  'archived',
  'banned',
])

export const editorTypeEnum = pgEnum('editor_type', [
  'local',
  'national',
  'breaking',
  'trend',
  'influencer',
  'event',
])

export const articleFormatEnum = pgEnum('article_format', [
  'standard',
  'column',
  'analysis',
])

/** P18.1 / P18.4B — durable publication authority on canonical PG news. */
export const publicationAuthorityEnum = pgEnum('publication_authority', [
  'HUMAN_EDITOR',
  'SYSTEM_ALERT',
  'LEGACY',
])

/** P18.4D.2 — human rights decision on canonical PG news (independent of publication_authority). */
export const newsRightsStatusEnum = pgEnum('news_rights_status', [
  'PENDING',
  'CLEARED',
  'REWRITE_REQUIRED',
  'DO_NOT_PUBLISH',
])

export const newsRightsBasisEnum = pgEnum('news_rights_basis', [
  'UNKNOWN',
  'PUBLISHER_ORIGINAL',
  'SOURCE_ASSOCIATED',
  'LICENSED',
  'OWNED',
  'OFFICIAL_RELEASE',
  'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
  'HUMAN_REVIEWED_OTHER',
])

export const news = pgTable(
  'news',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    legacyFirestoreId: varchar('legacy_firestore_id', { length: 64 }).unique(),
    slug: varchar('slug', { length: 300 }).notNull().unique(),
    title: text('title').notNull(),
    summary: varchar('summary', { length: 500 }),
    description: text('description'),
    content: text('content'),
    htmlContent: text('html_content'),

    status: newsStatusEnum('status').default('draft').notNull(),
    categoryId: varchar('category_id', { length: 50 }).references(
      () => categories.id
    ),
    citySiteId: varchar('city_site_id', { length: 50 }).references(
      () => citySites.id
    ),

    // Geography (denormalized for fast queries)
    cityName: varchar('city_name', { length: 100 }),
    citySlug: varchar('city_slug', { length: 50 }),
    districtName: varchar('district_name', { length: 100 }),
    districtSlug: varchar('district_slug', { length: 80 }),

    // Author
    authorId: varchar('author_id', { length: 128 }).references(
      () => users.firebaseUid
    ),
    authorDisplayName: varchar('author_display_name', { length: 100 }),

    // Source
    source: varchar('source', { length: 200 }),
    sourceUrl: text('source_url'),

    // Media (primary)
    thumbnailUrl: text('thumbnail_url'),
    coverImageUrl: text('cover_image_url'),
    videoUrl: text('video_url'),

    // Tags
    tags: text('tags').array(),

    // Counters
    viewsCount: integer('views_count').default(0).notNull(),
    likesCount: integer('likes_count').default(0).notNull(),
    commentsCount: integer('comments_count').default(0).notNull(),
    savesCount: integer('saves_count').default(0).notNull(),
    sharesCount: integer('shares_count').default(0).notNull(),

    // AI / Newsroom
    isAiGenerated: boolean('is_ai_generated').default(false).notNull(),
    editorType: editorTypeEnum('editor_type'),
    aiEditorId: varchar('ai_editor_id', { length: 64 }),
    articleFormat: articleFormatEnum('article_format'),
    confidenceScore: smallint('confidence_score'),

    // Flags
    isBreaking: boolean('is_breaking').default(false).notNull(),
    isFeatured: boolean('is_featured').default(false).notNull(),
    isEditorPick: boolean('is_editor_pick').default(false).notNull(),

    // SEO
    seoTitle: varchar('seo_title', { length: 200 }),
    seoDescription: varchar('seo_description', { length: 300 }),

    // P18.4B — publication provenance (nullable; LEGACY may leave actors null)
    publicationAuthority: publicationAuthorityEnum('publication_authority'),
    approvedBy: varchar('approved_by', { length: 128 }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    publishedBy: varchar('published_by', { length: 128 }),

    // P18.4B — migration provenance (null for native PG rows)
    migratedAt: timestamp('migrated_at', { withTimezone: true }),
    migrationBatchId: varchar('migration_batch_id', { length: 64 }),

    // P18.4D.2 — human rights decision (independent of publication_authority)
    rightsStatus: newsRightsStatusEnum('rights_status').default('PENDING'),
    rightsBasis: newsRightsBasisEnum('rights_basis').default('UNKNOWN'),
    rightsDecidedBy: varchar('rights_decided_by', { length: 128 }),
    rightsDecidedAt: timestamp('rights_decided_at', { withTimezone: true }),
    /** Non-null blocks publish regardless of CLEARED (e.g. HIGH_SOURCE_OVERLAP). */
    editorialBlocker: varchar('editorial_blocker', { length: 64 }),

    // Timestamps
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('news_status_published_idx').on(t.status, t.publishedAt),
    index('news_city_slug_idx').on(t.citySlug),
    index('news_category_idx').on(t.categoryId),
    index('news_city_site_idx').on(t.citySiteId),
    index('news_author_idx').on(t.authorId),
    index('news_created_at_idx').on(t.createdAt),
    index('news_publication_authority_idx').on(t.publicationAuthority),
    index('news_migration_batch_idx').on(t.migrationBatchId),
    index('news_rights_status_idx').on(t.rightsStatus),
    index('news_editorial_blocker_idx').on(t.editorialBlocker),
  ]
)
