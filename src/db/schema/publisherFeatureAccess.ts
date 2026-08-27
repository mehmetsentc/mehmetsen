import { boolean, index, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { publishers } from './publishers'

/** Phase P11 — per-publisher feature allowlist (controlled rollout). */
export const publisherFeatureAccess = pgTable(
  'publisher_feature_access',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    featureKey: varchar('feature_key', { length: 64 }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    updatedBy: varchar('updated_by', { length: 128 }),
    note: text('note'),
  },
  (t) => [
    uniqueIndex('pfa_publisher_feature_uidx').on(t.publisherId, t.featureKey),
    index('pfa_feature_enabled_idx').on(t.featureKey, t.enabled),
    index('pfa_publisher_idx').on(t.publisherId),
  ]
)
