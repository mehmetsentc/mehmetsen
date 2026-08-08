import { pgTable, varchar, timestamp, boolean } from 'drizzle-orm/pg-core'

export const countries = pgTable('countries', {
  code: varchar('code', { length: 2 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  nameLocal: varchar('name_local', { length: 100 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
