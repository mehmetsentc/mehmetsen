import { pgTable, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { users } from './users'
import { news } from './news'

export const userContentImpressions = pgTable(
  'user_content_impressions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 128 }).references(() => users.firebaseUid, {
      onDelete: 'cascade',
    }),
    sessionId: varchar('session_id', { length: 64 }),
    articleId: varchar('article_id', { length: 64 })
      .notNull()
      .references(() => news.id, { onDelete: 'cascade' }),
    clusterId: varchar('cluster_id', { length: 64 }),
    publisherId: varchar('publisher_id', { length: 64 }),
    feedType: varchar('feed_type', { length: 32 }).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    impressionCount: integer('impression_count').default(1).notNull(),
  },
  (t) => [
    index('user_content_impressions_user_article_idx').on(t.userId, t.articleId, t.feedType),
    index('user_content_impressions_session_article_idx').on(t.sessionId, t.articleId, t.feedType),
    index('user_content_impressions_cluster_user_idx').on(t.userId, t.clusterId),
    index('user_content_impressions_article_idx').on(t.articleId, t.lastSeenAt),
  ]
)
