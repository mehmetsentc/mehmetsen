import { pgTable, varchar, timestamp } from 'drizzle-orm/pg-core'
import { provinces } from './provinces'

export const districts = pgTable('districts', {
  slug: varchar('slug', { length: 80 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  provinceSlug: varchar('province_slug', { length: 50 })
    .notNull()
    .references(() => provinces.slug),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
