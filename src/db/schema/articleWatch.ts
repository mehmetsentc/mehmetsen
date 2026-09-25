import { pgTable, varchar, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * Per-actor article watch sessions (Insights).
 * Upserted on heartbeat — not one row per flush.
 * Raw rows are listed for 90 days; news aggregate counters are lifetime.
 */
export const articleWatchSessions = pgTable(
  'article_watch_sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    articleId: varchar('article_id', { length: 64 }).notNull(),
    /** `u:{uid}` when signed in, else `g:{sessionHash}`. */
    actorKey: varchar('actor_key', { length: 160 }).notNull(),
    userId: varchar('user_id', { length: 128 }),
    sessionHash: varchar('session_hash', { length: 64 }),
    surface: varchar('surface', { length: 16 }).notNull(),
    viewCounted: integer('view_counted').default(0).notNull(),
    contentDwellMs: integer('content_dwell_ms').default(0).notNull(),
    pageDwellMs: integer('page_dwell_ms').default(0).notNull(),
    firstAt: timestamp('first_at', { withTimezone: true }).defaultNow().notNull(),
    lastAt: timestamp('last_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('article_watch_sessions_actor_uidx').on(t.articleId, t.actorKey, t.surface),
    index('article_watch_sessions_article_last_idx').on(t.articleId, t.lastAt),
    index('article_watch_sessions_last_idx').on(t.lastAt),
  ]
)
