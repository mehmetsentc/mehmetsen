import { pgTable, varchar, boolean, timestamp } from 'drizzle-orm/pg-core'

export const categories = pgTable('categories', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  parentId: varchar('parent_id', { length: 50 }),
  iconName: varchar('icon_name', { length: 50 }),
  color: varchar('color', { length: 7 }),
  isStandalone: boolean('is_standalone').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
