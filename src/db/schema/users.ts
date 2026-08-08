import { pgTable, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', [
  'user',
  'author',
  'video_editor',
  'editor',
  'managing_editor',
  'super_admin',
])

/**
 * Users — maps Firebase Auth UIDs to NaHaber profiles.
 * Firebase Auth remains the source of truth for authentication;
 * this table stores profile/role data for relational queries.
 */
export const users = pgTable('users', {
  firebaseUid: varchar('firebase_uid', { length: 128 }).primaryKey(),
  email: varchar('email', { length: 255 }).unique(),
  username: varchar('username', { length: 30 }).unique(),
  displayName: varchar('display_name', { length: 100 }),
  photoUrl: varchar('photo_url', { length: 500 }),
  role: userRoleEnum('role').default('user').notNull(),
  homeCitySlug: varchar('home_city_slug', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
