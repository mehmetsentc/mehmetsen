import { boolean, index, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

/** Phase P14 — per-user feature allowlist (controlled consumer pilot). */
export const userFeatureAccess = pgTable(
  'user_feature_access',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    featureKey: varchar('feature_key', { length: 64 }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    updatedBy: varchar('updated_by', { length: 128 }),
    reason: text('reason'),
  },
  (t) => [
    uniqueIndex('ufa_user_feature_uidx').on(t.userId, t.featureKey),
    index('ufa_feature_enabled_idx').on(t.featureKey, t.enabled),
    index('ufa_user_idx').on(t.userId),
  ]
)
