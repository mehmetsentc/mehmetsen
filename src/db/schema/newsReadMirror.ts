import { pgTable, varchar, integer, timestamp, jsonb, text, index } from 'drizzle-orm/pg-core'

/**
 * FinOps Neon migration, phase 1 (13 Nov 2026): read-only mirror of Firestore `news`.
 *
 * Firestore stays the source of truth for writes. Every publish, edit and unpublish
 * upserts the article here (see services/newsMirror), and a daily reconcile catches
 * anything missed. Phase 2 moves public list/detail reads to this table behind
 * per-surface flags, with Firestore as the fallback.
 *
 * Deliberately a separate table, not `news`: rows in `news` are treated as the
 * canonical PG authority by getNewsBySlug, sitemaps and the feed, so mirroring
 * Firestore into it would silently change what the site renders.
 *
 * `doc` holds the whole Firestore document with Timestamps as ISO strings, so read
 * paths can keep using newsDocToPost / docToNewsItem unchanged. The indexed columns
 * are the filters the public list queries use.
 */
export const newsReadMirror = pgTable(
  'news_read_mirror',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    slug: varchar('slug', { length: 512 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    categoryId: varchar('category_id', { length: 128 }),
    citySlug: varchar('city_slug', { length: 128 }),
    districtSlug: varchar('district_slug', { length: 128 }),
    authorId: varchar('author_id', { length: 128 }),
    tags: text('tags').array(),
    views: integer('views').default(0).notNull(),
    doc: jsonb('doc').notNull(),
    mirroredAt: timestamp('mirrored_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Not unique: legacy Firestore docs can share a slug.
    index('news_read_mirror_slug_idx').on(t.slug),
    index('news_read_mirror_status_published_idx').on(t.status, t.publishedAt),
    index('news_read_mirror_category_published_idx').on(t.categoryId, t.publishedAt),
    index('news_read_mirror_city_published_idx').on(t.citySlug, t.publishedAt),
    index('news_read_mirror_author_published_idx').on(t.authorId, t.publishedAt),
  ]
)
