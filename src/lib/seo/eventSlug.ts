import { slugifyNewsTitle } from '@/lib/newsSlug'

/**
 * Deterministic, Turkish-normalized event slug candidate.
 * Prefer stable eventKey; else title slug; else cluster id.
 */
export function deriveEventSlug(canonicalTitle: string | null, eventKey: string | null, id: string): string {
  const key = eventKey?.trim().toLowerCase()
  if (key) {
    return (
      key
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 200) || id
    )
  }
  if (canonicalTitle?.trim()) return slugifyNewsTitle(canonicalTitle).slice(0, 200)
  return id
}

/** Collision-safe candidate: base, then base-2 … base-8, then id suffix. */
export function eventSlugCandidates(base: string, clusterId: string): string[] {
  const clean = base.slice(0, 200) || clusterId
  const out = [clean]
  for (let i = 2; i <= 8; i++) {
    out.push(`${clean.slice(0, 180)}-${i}`)
  }
  const shortId = clusterId.replace(/[^a-z0-9]/gi, '').slice(-8) || 'evt'
  out.push(`${clean.slice(0, 180)}-${shortId}`)
  return out
}
