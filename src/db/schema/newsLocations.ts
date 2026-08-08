import { pgTable, varchar, real, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { news } from './news'
import { provinces } from './provinces'
import { districts } from './districts'

/**
 * Explicit news → location join table.
 * A single article can reference multiple provinces/districts
 * (e.g. "Çanakkale–İstanbul highway" story).
 */
export const newsLocations = pgTable(
  'news_locations',
  {
    newsId: varchar('news_id', { length: 64 })
      .notNull()
      .references(() => news.id, { onDelete: 'cascade' }),
    provinceSlug: varchar('province_slug', { length: 50 })
      .notNull()
      .references(() => provinces.slug),
    districtSlug: varchar('district_slug', { length: 80 }).references(
      () => districts.slug
    ),
    lat: real('lat'),
    lng: real('lng'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.newsId, t.provinceSlug] })]
)
