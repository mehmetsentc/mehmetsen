import { pgTable, varchar, real, timestamp } from 'drizzle-orm/pg-core'
import { countries } from './countries'

export const provinces = pgTable('provinces', {
  slug: varchar('slug', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  countryCode: varchar('country_code', { length: 2 })
    .notNull()
    .references(() => countries.code),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
