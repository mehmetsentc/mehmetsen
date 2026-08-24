import { pgTable, varchar, boolean, timestamp } from 'drizzle-orm/pg-core'
import { provinces } from './provinces'

/**
 * City sites (tenants) — each represents a city subdomain of NaHaber.
 * e.g. canakkale.nahaber.com → slug 'canakkale'
 *      antalya.nahaber.com → slug 'antalya'
 */
export const citySites = pgTable('city_sites', {
  id: varchar('id', { length: 50 }).primaryKey(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  domain: varchar('domain', { length: 255 }).notNull(),
  provinceSlug: varchar('province_slug', { length: 50 })
    .references(() => provinces.slug),
  isActive: boolean('is_active').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
