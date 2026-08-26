import { pgTable, varchar, real, timestamp, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core'
import { users } from './users'
import { publishers } from './publishers'

export const userInterestScores = pgTable(
  'user_interest_scores',
  {
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    interestKey: varchar('interest_key', { length: 64 }).notNull(),
    score: real('score').default(0).notNull(),
    source: varchar('source', { length: 16 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.interestKey, t.source], name: 'user_interest_scores_pk' }),
    index('user_interest_scores_user_source_idx').on(t.userId, t.source, t.score),
    index('user_interest_scores_interest_idx').on(t.interestKey, t.score),
  ]
)

export const userPublisherAffinity = pgTable(
  'user_publisher_affinity',
  {
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    score: real('score').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.publisherId], name: 'user_publisher_affinity_pk' }),
    index('user_publisher_affinity_user_score_idx').on(t.userId, t.score),
    index('user_publisher_affinity_publisher_idx').on(t.publisherId, t.score),
  ]
)

export const userFeedPreferences = pgTable(
  'user_feed_preferences',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    preferenceType: varchar('preference_type', { length: 32 }).notNull(),
    targetType: varchar('target_type', { length: 24 }).notNull(),
    targetId: varchar('target_id', { length: 128 }).notNull(),
    modifier: real('modifier').default(-1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('user_feed_preferences_user_type_idx').on(t.userId, t.preferenceType, t.createdAt),
    index('user_feed_preferences_target_idx').on(t.targetType, t.targetId, t.userId),
    uniqueIndex('user_feed_preferences_user_target_uidx').on(
      t.userId,
      t.preferenceType,
      t.targetType,
      t.targetId
    ),
  ]
)
