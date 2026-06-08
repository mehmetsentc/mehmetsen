import type { NaEvent } from '@/types/event'

/**
 * Client-safe event identity + dedupe helpers (no env/secret access), shared by
 * the server aggregator, daily sync, and the client merge in `useEvents`.
 */

/** FNV-1a base36 hash — deterministic and dependency-free. */
function stableHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Content fingerprint for incremental sync. When unchanged, Firestore writes
 * are skipped even though providers are re-scraped daily.
 */
export function buildEventFingerprint(
  event: Pick<
    NaEvent,
    | 'title'
    | 'description'
    | 'category'
    | 'citySlug'
    | 'venue'
    | 'startsAt'
    | 'endsAt'
    | 'coverImageUrl'
    | 'ticketUrl'
    | 'lat'
    | 'lng'
  >
): string {
  const parts = [
    event.title,
    event.description ?? '',
    event.category,
    event.citySlug,
    event.venue ?? '',
    event.startsAt,
    event.endsAt ?? '',
    event.coverImageUrl ?? '',
    event.ticketUrl ?? '',
    event.lat ?? '',
    event.lng ?? '',
  ]
  return stableHash(parts.join('|'))
}

/**
 * Identity key for an event, independent of its source. Two events that share a
 * normalized title + start time + venue are considered the same real-world
 * event even if they came from different platforms (or both Firestore and a
 * ticket provider).
 */
export function eventIdentityKey(parts: {
  title: string
  startsAt: string
  venue?: string
}): string {
  const norm = (s: string) =>
    s
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  return [norm(parts.title), parts.startsAt, norm(parts.venue ?? '')].join('|')
}

/** How "complete" an event is — used to pick the best of two duplicates. */
function richness(e: NaEvent): number {
  return (
    (e.coverImageUrl ? 1 : 0) +
    (e.ticketUrl ? 1 : 0) +
    (e.lat !== undefined && e.lng !== undefined ? 1 : 0) +
    (e.description ? 1 : 0)
  )
}

/**
 * Dedupes a list of events. Earlier sources win ties only via richness; when an
 * identity key repeats we keep the richer record. Also collapses exact `id`
 * duplicates. Order of first appearance is otherwise preserved.
 */
export function dedupeEvents(events: NaEvent[]): NaEvent[] {
  const byKey = new Map<string, NaEvent>()
  const order: string[] = []

  for (const event of events) {
    const key = eventIdentityKey({
      title: event.title,
      startsAt: event.startsAt,
      venue: event.venue,
    })
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, event)
      order.push(key)
    } else if (richness(event) > richness(existing)) {
      byKey.set(key, event)
    }
  }

  return order.map((key) => byKey.get(key)!)
}
