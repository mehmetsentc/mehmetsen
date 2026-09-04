/**
 * Positive editorial actor mapping — exact Firebase UID membership only.
 */

import 'server-only'

import { inArray } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { users } from '@/db/schema/users'
import { TRUSTED_EDITORIAL_ROLES } from '@/services/editorial/canonicalMigrationEligibility'

/** Exact UID set from users with trusted editorial roles. */
export async function loadTrustedEditorialActorUids(): Promise<Set<string>> {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  const db = getDb()
  const rows = await db
    .select({ uid: users.firebaseUid, role: users.role })
    .from(users)
    .where(inArray(users.role, [...TRUSTED_EDITORIAL_ROLES]))
  return new Set(rows.map((r) => r.uid).filter(Boolean))
}
