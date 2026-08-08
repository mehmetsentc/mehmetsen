import { pgTable, varchar, boolean, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { news } from './news'
import { categories } from './categories'

/**
 * Many-to-many: a news article can belong to multiple categories
 * (primary + secondary tagging). The `isPrimary` flag marks the
 * canonical category shown in the UI header.
 */
export const newsCategories = pgTable(
  'news_categories',
  {
    newsId: varchar('news_id', { length: 64 })
      .notNull()
      .references(() => news.id, { onDelete: 'cascade' }),
    categoryId: varchar('category_id', { length: 50 })
      .notNull()
      .references(() => categories.id),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.newsId, t.categoryId] })]
)
