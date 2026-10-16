import type { NaEvent } from '@/types/event'

/**
 * CITY-SERVICES-1 — the same show is often sold on two ticket sites (Biletix + Bubilet),
 * once as «Yung Ouzo» and once as «Yung Ouzo Konseri», at the same minute. Keep one card.
 */

const FILLER = new Set([
  'konseri', 'konser', 'gösterisi', 'oyunu', 'tiyatro', 'şov', 'show', 'canlı',
  'performansı', 'etkinliği', 'live',
])

export function eventTitleKey(title: string): string {
  return title
    .toLocaleLowerCase('tr-TR')
    .replace(/[“”"'’`´]/g, '')
    .replace(/[^a-z0-9çğıöşüâîû]+/g, ' ')
    .split(' ')
    .filter((w) => w && !FILLER.has(w))
    .join(' ')
}

function sameShow(a: NaEvent, b: NaEvent): boolean {
  const ta = Date.parse(a.startsAt)
  const tb = Date.parse(b.startsAt)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false
  if (Math.abs(ta - tb) > 30 * 60 * 1000) return false
  const ka = eventTitleKey(a.title)
  const kb = eventTitleKey(b.title)
  if (!ka || !kb) return false
  if (ka === kb) return true
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka]
  return short.length >= 5 && long.startsWith(short)
}

/** Higher = richer record (real end time, photo, ticket link, longer description). */
function richness(e: NaEvent): number {
  let s = 0
  const st = Date.parse(e.startsAt)
  const en = e.endsAt ? Date.parse(e.endsAt) : NaN
  if (Number.isFinite(en) && en > st) s += 4
  if (e.coverImageUrl) s += 3
  if (e.ticketUrl) s += 2
  if (e.description && e.description.length > 80) s += 1
  if (e.ratingCount) s += 1
  return s
}

export function dedupeCityEvents(events: NaEvent[]): NaEvent[] {
  const kept: NaEvent[] = []
  for (const e of events) {
    const i = kept.findIndex((k) => sameShow(k, e))
    if (i === -1) kept.push(e)
    else if (richness(e) > richness(kept[i]!)) kept[i] = e
  }
  return kept
}

/**
 * Featured strip: events with a photo in the next two weeks, ticketed / rated first,
 * then soonest. Cinema has its own strip.
 */
export function pickFeaturedEvents(events: NaEvent[], now: Date = new Date(), limit = 8): NaEvent[] {
  const t0 = now.getTime() - 3 * 60 * 60 * 1000
  const t1 = now.getTime() + 14 * 24 * 60 * 60 * 1000
  return events
    .filter((e) => e.category !== 'cinema' && !!e.coverImageUrl)
    .filter((e) => {
      const t = Date.parse(e.startsAt)
      return Number.isFinite(t) && t >= t0 && t <= t1
    })
    .map((e) => ({
      e,
      score:
        (e.ticketUrl ? 2 : 0) +
        (e.averageRating ? e.averageRating / 2 : 0) +
        (e.category === 'concert' || e.category === 'theater' || e.category === 'festival' ? 1 : 0) -
        (Date.parse(e.startsAt) - now.getTime()) / (7 * 24 * 60 * 60 * 1000),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}
