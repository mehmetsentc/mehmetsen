import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

/** App convention first, then Neon’s Vercel integration aliases. */
export const DATABASE_URL_ENV_KEYS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
] as const

export function resolveDatabaseUrl(): string | null {
  for (const key of DATABASE_URL_ENV_KEYS) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return null
}

function getDatabaseUrl(): string {
  const url = resolveDatabaseUrl()
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. See docs/NAHABER_CITY_NETWORK.md for setup instructions.'
    )
  }
  return url
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

/**
 * Lazy-initialised Drizzle client backed by Neon serverless HTTP driver.
 * Only call from server-side code paths guarded by CITY_NETWORK_ENABLED.
 *
 * Usage:
 * ```ts
 * if (process.env.CITY_NETWORK_ENABLED === 'true') {
 *   const db = getDb()
 *   const rows = await db.select().from(schema.news).limit(10)
 * }
 * ```
 */
export function getDb() {
  if (!_db) {
    const sql = neon(getDatabaseUrl())
    _db = drizzle(sql, { schema })
  }
  return _db
}

/**
 * Feature-flag helpers — safe to call anywhere (server-only env vars).
 * All default to false so production Firestore paths are untouched.
 */
export function isCityNetworkEnabled(): boolean {
  return process.env.CITY_NETWORK_ENABLED === 'true'
}

export function isPostgresReadsEnabled(): boolean {
  return process.env.POSTGRES_READS_ENABLED === 'true'
}

export function hasDatabaseUrl(): boolean {
  return Boolean(resolveDatabaseUrl())
}

export { schema }
