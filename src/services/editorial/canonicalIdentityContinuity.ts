/**
 * P18.4B — Canonical identity continuity helpers (social + seen).
 *
 * Design: prefer creating future PG rows with id === firestoreId (and
 * legacy_firestore_id === firestoreId) so existing FS-only social/seen rows
 * continue to match without remapping.
 *
 * Until migration executes: expand aliases across FS id ↔ PG id ↔ legacy_firestore_id.
 * NO mutations in this module.
 */

export type CanonicalIdentityInput = {
  firestoreId?: string | null
  pgId?: string | null
  legacyFirestoreId?: string | null
  slug?: string | null
}

/**
 * Deterministic alias set for social/seen lookups.
 * Exact strings only — no fuzzy matching.
 */
export function resolveCanonicalIdentityAliases(input: CanonicalIdentityInput): string[] {
  const out = new Set<string>()
  for (const raw of [input.firestoreId, input.pgId, input.legacyFirestoreId, input.slug]) {
    if (typeof raw !== 'string') continue
    const t = raw.trim()
    if (t) out.add(t)
  }
  return Array.from(out)
}

/**
 * Preferred future PG primary key for a migrated FS document.
 * Using the FS document id preserves social/seen continuity without row rewrites.
 */
export function preferredMigratedPgId(firestoreId: string): string {
  return firestoreId.trim()
}

/**
 * Future strategy note (documentation for P18.4C+):
 * A) Prefer id = FS id at insert time → zero social/seen remaps
 * B) If collision forces a new PG id → transactional remap likes/saves/comments/impressions
 *    FS id → PG id in one transaction; keep legacy_firestore_id = FS id for alias forever
 */
export const CANONICAL_IDENTITY_STRATEGY = 'prefer_fs_id_as_pg_id_with_legacy_alias' as const
