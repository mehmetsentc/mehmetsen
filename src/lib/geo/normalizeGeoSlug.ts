/**
 * Canonical geography slug normalization (identifiers only).
 * Display names remain Turkish; this is for TR:<province>:<district> identity.
 *
 * Does NOT remap district→province (that is compound resolution).
 * Does NOT change news title / article SEO slug behavior.
 */
import { slugifyCity } from '@/lib/location'

/** Deterministic ASCII geo token: beşiktaş → besiktas, gönen → gonen. */
export function normalizeGeoSlug(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  // Already-looking slug: still run through slugify for unicode safety
  const out = slugifyCity(s)
  return out || null
}

/** True when normalizeGeoSlug changes the raw token (unicode / casing / separators). */
export function geoSlugNeedsNormalization(raw: string | null | undefined): boolean {
  const s = (raw ?? '').trim()
  if (!s) return false
  const n = normalizeGeoSlug(s)
  return Boolean(n && n !== s.trim().toLowerCase())
}
