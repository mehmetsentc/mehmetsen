/**
 * Public publisher profile URL slug contract.
 * Must stay in sync with /publisher/[slug] page gate.
 */
const PUBLISHER_PROFILE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizePublisherProfileSlug(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).trim().toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

/** True when slug can be routed to /publisher/[slug] without hard 404 from format gate. */
export function isPublisherProfileSlug(raw: string | null | undefined): boolean {
  const slug = normalizePublisherProfileSlug(raw)
  if (!slug || slug.startsWith('src_') || slug === 'source') return false
  return PUBLISHER_PROFILE_SLUG_RE.test(slug)
}
