import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, real, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

/** Short-retention raw buffer. CMS never scans this table. */
export const analyticsEventBuffer = pgTable(
  'analytics_event_buffer',
  {
    eventId: varchar('event_id', { length: 64 }).primaryKey(),
    event: varchar('event', { length: 24 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    path: varchar('path', { length: 500 }).notNull(),
    postId: varchar('post_id', { length: 64 }),
    visitorHash: varchar('visitor_hash', { length: 32 }).notNull(),
    sessionHash: varchar('session_hash', { length: 32 }).notNull(),
    referrer: varchar('referrer', { length: 120 }),
    device: varchar('device', { length: 24 }),
    city: varchar('city', { length: 80 }),
    country: varchar('country', { length: 8 }),
    durationMs: integer('duration_ms').default(0).notNull(),
    scrollDepth: integer('scroll_depth').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('analytics_event_buffer_occurred_idx').on(t.occurredAt)]
)

export const analyticsHourly = pgTable(
  'analytics_hourly',
  {
    hour: varchar('hour', { length: 16 }).primaryKey(),
    pageviews: integer('pageviews').default(0).notNull(),
    uniqueVisitors: integer('unique_visitors').default(0).notNull(),
    sessions: integer('sessions').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('analytics_hourly_hour_idx').on(t.hour)]
)

export const analyticsDaily = pgTable(
  'analytics_daily',
  {
    day: varchar('day', { length: 10 }).primaryKey(),
    pageviews: integer('pageviews').default(0).notNull(),
    uniqueVisitors: integer('unique_visitors').default(0).notNull(),
    sessions: integer('sessions').default(0).notNull(),
    bounceApprox: real('bounce_approx').default(0).notNull(),
    avgDurationMs: integer('avg_duration_ms').default(0).notNull(),
    avgScrollDepth: integer('avg_scroll_depth').default(0).notNull(),
    topPages: jsonb('top_pages')
      .$type<Array<{ path: string; views: number }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    topPosts: jsonb('top_posts')
      .$type<Array<{ postId: string; views: number }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    cities: jsonb('cities')
      .$type<Array<{ key: string; views: number }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    referrers: jsonb('referrers')
      .$type<Array<{ key: string; views: number }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    devices: jsonb('devices')
      .$type<Array<{ key: string; views: number }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('analytics_daily_day_uidx').on(t.day)]
)
