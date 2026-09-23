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

const DISPLAY_TIME_WINDOW_MIN = 2

function foldDisplay(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titlesCompatible(a: string, b: string): boolean {
  const na = foldDisplay(a)
  const nb = foldDisplay(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  return shorter.length >= 6 && longer.includes(shorter)
}

function venuesCompatible(a?: string, b?: string): boolean {
  const na = foldDisplay(a ?? '')
  const nb = foldDisplay(b ?? '')
  if (!na || !nb) return true
  if (na === nb) return true
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  return shorter.length >= 4 && longer.includes(shorter)
}

function istanbulDateAndMinutes(iso: string): { date: string; minutes: number } | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return { date: day, minutes: hour * 60 + minute }
}

function biletixEventCode(url?: string): string | null {
  const value = url?.trim()
  if (!value) return null
  const performance = value.match(/\/performance\/([A-Za-z0-9]+)/i)
  if (performance) return performance[1].toUpperCase()
  const event = value.match(/\/etkinlik\/([A-Za-z0-9]+)/i)
  return event?.[1]?.toUpperCase() ?? null
}

function sameDisplayOccurrence(a: NaEvent, b: NaEvent): boolean {
  if ((a.citySlug ?? '') !== (b.citySlug ?? '') || !a.citySlug) return false
  const timeA = istanbulDateAndMinutes(a.startsAt)
  const timeB = istanbulDateAndMinutes(b.startsAt)
  if (!timeA || !timeB || timeA.date !== timeB.date) return false
  if (Math.abs(timeA.minutes - timeB.minutes) > DISPLAY_TIME_WINDOW_MIN) return false
  if (!venuesCompatible(a.venue, b.venue)) return false
  const codeA = biletixEventCode(a.ticketUrl)
  const codeB = biletixEventCode(b.ticketUrl)
  if (codeA && codeB) return codeA === codeB
  return titlesCompatible(a.title, b.title)
}

function pickRicher(a: NaEvent, b: NaEvent): NaEvent {
  const score = (event: NaEvent) => richness(event) + (event.venue ? 2 : 0)
  const winner = score(b) > score(a) ? b : a
  const loser = winner === a ? b : a
  return {
    ...winner,
    coverImageUrl: winner.coverImageUrl || loser.coverImageUrl,
    ticketUrl: winner.ticketUrl || loser.ticketUrl,
    venue: winner.venue || loser.venue,
    address: winner.address || loser.address,
  }
}

/**
 * Presentation-only collapse for listing cards. Same artist/city/day/time
 * (or same Biletix event code) becomes one row. Distinct sessions stay split.
 * Firestore documents are not deleted.
 */
export function collapseDisplayDuplicates(events: NaEvent[]): NaEvent[] {
  const unique = dedupeEvents(events)
  const parent = unique.map((_, index) => index)
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index])
    return parent[index]
  }

  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      if (sameDisplayOccurrence(unique[i], unique[j])) {
        parent[find(j)] = find(i)
      }
    }
  }

  const clusters = new Map<number, NaEvent[]>()
  unique.forEach((event, index) => {
    const root = find(index)
    const list = clusters.get(root) ?? []
    list.push(event)
    clusters.set(root, list)
  })

  const emitted = new Set<number>()
  const display: NaEvent[] = []
  unique.forEach((_, index) => {
    const root = find(index)
    if (emitted.has(root)) return
    emitted.add(root)
    const cluster = clusters.get(root) ?? []
    let winner = cluster[0]
    for (let i = 1; i < cluster.length; i += 1) {
      winner = pickRicher(winner, cluster[i])
    }
    if (winner) display.push(winner)
  })
  return display
}
