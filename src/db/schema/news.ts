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
  ]
)
