import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
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
  return Boolean(process.env.DATABASE_URL?.trim())
}

export { schema }
