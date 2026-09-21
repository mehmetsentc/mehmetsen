import { eventIdentityKey } from '@/lib/eventDedupe'
import type { NaEvent } from '@/types/event'
import { istanbulCalendarParts } from '@/lib/annualEventDates'
import { istanbulLocalDateKey } from './occurrence'
import { classifyEventImage, preferEventPoster } from './imageQuality'
import { isEventSpecificTicketUrl, parseBiletixPerformanceUrl } from './ticketUrl'

function classifyAuditTicket(url: string | null | undefined) {
  const value = url?.trim()
  if (!value) return 'MISSING'
  if (parseBiletixPerformanceUrl(value)) return 'PERFORMANCE_SPECIFIC'
  if (isEventSpecificTicketUrl(value)) return 'EVENT_SPECIFIC'
  return 'GENERIC_INVALID'
}

function classifyAuditImage(url: string | null | undefined) {
  const value = url?.trim()
  if (!value) return 'INVALID'
  if (/ticketm\.net\/dam\/c\//i.test(value)) return 'GENERIC_CATEGORY'
  if (/(favicon|apple-touch-icon|\/logo\b|logo\.(png|svg|jpg|webp))/i.test(value)) return 'GENERIC_PROVIDER'
  const quality = classifyEventImage(value)
  if (quality === 'specific') return 'EVENT_SPECIFIC'
  if (quality === 'generic') return 'GENERIC_PROVIDER'
  if (quality === 'none') return 'INVALID'
  return 'FALLBACK'
}

/**
 * Conservative clock-skew window. 20:59 vs 21:00 is rounding.
 * 18:00 vs 21:00 is a different session and must stay DISTINCT.
 */
export const TIME_HIGH_CONFIDENCE_MINUTES = 2
export const TIME_AMBIGUOUS_MAX_MINUTES = 15

export type ReconcileConfidence = 'EXACT' | 'HIGH_CONFIDENCE' | 'AMBIGUOUS' | 'DISTINCT'

export type VenueCompat = 'EXACT' | 'HIGH' | 'AMBIGUOUS' | 'DISTINCT'

export interface ReconcilePair {
  leftId: string
  rightId: string
  leftSource: string
  rightSource: string
  title: string
  citySlug: string
  date: string
  timeA: string
  timeB: string
  venueA: string
  venueB: string
  venueNormA: string
  venueNormB: string
  confidence: ReconcileConfidence
  why: string[]
}

export interface DisplayReconcileResult {
  events: NaEvent[]
  pairs: ReconcilePair[]
  suppressedDisplayCards: number
  providerRecordsDeleted: 0
}

function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeTitleForReconcile(title: string): string {
  return fold(title)
}

/**
 * Conservative venue aliasing for known institutional prefixes/suffixes.
 * Does not strip hall numbers, branch names, or unrelated venue cores.
 */
export function normalizeVenueAlias(venue: string): string {
  let s = fold(venue)
  s = s.replace(/\b(yeni hizmet binasi|yeni hizmet binas)\b/g, ' ')
  s = s.replace(/\b(kongre merkezi|kultur merkezi|konferans salonu|kongre salonu)\b/g, ' ')
  s = s.replace(/\b(comu|cukurova universitesi|universitesi|univ|unv)\b/g, ' ')
  s = s.replace(/\b(salonu|salon)\b(?! [a-z0-9])/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

export function minutesOfIstanbulDay(iso: string): number {
  const { hour, minute } = istanbulCalendarParts(iso)
  return hour * 60 + minute
}

export function timeDeltaMinutes(aIso: string, bIso: string): number {
  return Math.abs(minutesOfIstanbulDay(aIso) - minutesOfIstanbulDay(bIso))
}

const GENERIC_VENUE = /^(sahne|mekan|salon|hall|arena|tiyatro|sahnesi)$/

export function venueCompatibility(a: string, b: string): VenueCompat {
  const na = normalizeVenueAlias(a)
  const nb = normalizeVenueAlias(b)
  if (!na && !nb) return 'AMBIGUOUS'
  if (na === nb) return 'EXACT'
  if (GENERIC_VENUE.test(na) || GENERIC_VENUE.test(nb)) return 'AMBIGUOUS'
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  if (shorter.length >= 4 && longer.includes(shorter)) return 'HIGH'
  return 'DISTINCT'
}

function identityKey(event: NaEvent): string {
  return eventIdentityKey({
    title: event.title,
    startsAt: event.startsAt,
    venue: event.venue,
  })
}

export function classifyOccurrencePair(a: NaEvent, b: NaEvent): ReconcilePair {
  const why: string[] = []
  const titleOk = normalizeTitleForReconcile(a.title) === normalizeTitleForReconcile(b.title)
  const cityOk = (a.citySlug ?? '') === (b.citySlug ?? '') && Boolean(a.citySlug)
  const dateOk = istanbulLocalDateKey(a.startsAt) === istanbulLocalDateKey(b.startsAt)
  const dt = timeDeltaMinutes(a.startsAt, b.startsAt)
  const venue = venueCompatibility(a.venue ?? '', b.venue ?? '')
  const exactIdentity = identityKey(a) === identityKey(b)

  if (!titleOk) why.push('title_differs')
  if (!cityOk) why.push('province_differs')
  if (!dateOk) why.push('date_differs')
  if (dt === 0) why.push('time_exact')
  else if (dt <= TIME_HIGH_CONFIDENCE_MINUTES) why.push(`time_skew_${dt}m`)
  else if (dt <= TIME_AMBIGUOUS_MAX_MINUTES) why.push(`time_offset_${dt}m`)
  else why.push(`time_session_${dt}m`)
  why.push(`venue_${venue.toLowerCase()}`)

  let confidence: ReconcileConfidence = 'DISTINCT'
  if (!titleOk || !cityOk || !dateOk) {
    confidence = 'DISTINCT'
  } else if (exactIdentity) {
    confidence = 'EXACT'
  } else if (dt > TIME_AMBIGUOUS_MAX_MINUTES || venue === 'DISTINCT') {
    confidence = 'DISTINCT'
  } else if (dt <= TIME_HIGH_CONFIDENCE_MINUTES && (venue === 'EXACT' || venue === 'HIGH')) {
    confidence = 'HIGH_CONFIDENCE'
  } else {
    confidence = 'AMBIGUOUS'
  }

  return {
    leftId: a.id,
    rightId: b.id,
    leftSource: a.source ?? '',
    rightSource: b.source ?? '',
    title: a.title,
    citySlug: a.citySlug,
    date: istanbulLocalDateKey(a.startsAt),
    timeA: istanbulCalendarParts(a.startsAt).hour.toString().padStart(2, '0') + ':' +
      istanbulCalendarParts(a.startsAt).minute.toString().padStart(2, '0'),
    timeB: istanbulCalendarParts(b.startsAt).hour.toString().padStart(2, '0') + ':' +
      istanbulCalendarParts(b.startsAt).minute.toString().padStart(2, '0'),
    venueA: a.venue ?? '',
    venueB: b.venue ?? '',
    venueNormA: normalizeVenueAlias(a.venue ?? ''),
    venueNormB: normalizeVenueAlias(b.venue ?? ''),
    confidence,
    why,
  }
}

function ticketRank(event: NaEvent): number {
  const parsed = parseBiletixPerformanceUrl(event.ticketUrl)
  const ticket = classifyAuditTicket(event.ticketUrl)
  if (parsed && parsed.performanceIndex !== '001') return 5
  if (ticket === 'PERFORMANCE_SPECIFIC' && parsed?.performanceIndex === '001') {
    return 2
  }
  if (ticket === 'PERFORMANCE_SPECIFIC') return 4
  if (ticket === 'EVENT_SPECIFIC') return 3
  return 0
}

function posterRank(event: NaEvent): number {
  const image = classifyAuditImage(event.coverImageUrl)
  if (image === 'EVENT_SPECIFIC') return 3
  if (image === 'FALLBACK') return 1
  return 0
}

export function pickDisplayOccurrence(a: NaEvent, b: NaEvent): NaEvent {
  const score = (event: NaEvent) =>
    ticketRank(event) * 10 + posterRank(event) * 8 + (event.venue ? 2 : 0) + (event.address ? 1 : 0)
  const winner = score(b) > score(a) ? b : a
  const loser = winner === a ? b : a
  const merged: NaEvent = { ...winner }
  merged.coverImageUrl = preferEventPoster(winner.coverImageUrl, loser.coverImageUrl)
  if (ticketRank(loser) > ticketRank(winner)) merged.ticketUrl = loser.ticketUrl
  if (!merged.venue && loser.venue) merged.venue = loser.venue
  if (!merged.address && loser.address) merged.address = loser.address
  if (!merged.districtSlug && loser.districtSlug) merged.districtSlug = loser.districtSlug
  return merged
}

export function findReconcilePairs(events: NaEvent[]): ReconcilePair[] {
  const pairs: ReconcilePair[] = []
  const seen = new Set<string>()
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i]
      const b = events[j]
      if ((a.source ?? '') === (b.source ?? '')) continue
      if (normalizeTitleForReconcile(a.title) !== normalizeTitleForReconcile(b.title)) continue
      if ((a.citySlug ?? '') !== (b.citySlug ?? '')) continue
      if (istanbulLocalDateKey(a.startsAt) !== istanbulLocalDateKey(b.startsAt)) continue
      const key = [a.id, b.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push(classifyOccurrencePair(a, b))
    }
  }
  return pairs
}

class UnionFind {
  private parent = new Map<string, string>()
  find(id: string): string {
    if (!this.parent.has(id)) this.parent.set(id, id)
    const p = this.parent.get(id)!
    if (p !== id) this.parent.set(id, this.find(p))
    return this.parent.get(id)!
  }
  union(a: string, b: string) {
    const pa = this.find(a)
    const pb = this.find(b)
    if (pa !== pb) this.parent.set(pa, pb)
  }
}

/**
 * Presentation-only collapse. Provider documents stay as-is.
 * Only EXACT and HIGH_CONFIDENCE pairs become one display row.
 */
export function reconcileForDisplay(events: NaEvent[]): DisplayReconcileResult {
  const byId = new Map(events.map((event) => [event.id, event]))
  const unique = [...byId.values()]
  const pairs = findReconcilePairs(unique)
  const uf = new UnionFind()
  for (const event of unique) uf.find(event.id)
  const byIdentity = new Map<string, NaEvent>()
  for (const event of unique) {
    const key = identityKey(event)
    const existing = byIdentity.get(key)
    if (existing) uf.union(existing.id, event.id)
    else byIdentity.set(key, event)
  }
  for (const pair of pairs) {
    if (pair.confidence === 'EXACT' || pair.confidence === 'HIGH_CONFIDENCE') {
      uf.union(pair.leftId, pair.rightId)
    }
  }

  const clusters = new Map<string, NaEvent[]>()
  for (const event of unique) {
    const root = uf.find(event.id)
    const list = clusters.get(root) ?? []
    list.push(event)
    clusters.set(root, list)
  }

  const display: NaEvent[] = []
  let suppressedDisplayCards = 0
  for (const cluster of clusters.values()) {
    let winner = cluster[0]
    for (let i = 1; i < cluster.length; i += 1) {
      winner = pickDisplayOccurrence(winner, cluster[i])
    }
    display.push(winner)
    suppressedDisplayCards += cluster.length - 1
  }

  return {
    events: display,
    pairs,
    suppressedDisplayCards,
    providerRecordsDeleted: 0,
  }
}

export type StructuredInventoryClass =
  | 'LIVE_EVENT'
  | 'MUSEUM_ADMISSION'
  | 'ATTRACTION'
  | 'EXPERIENCE'
  | 'UNKNOWN'

/** Structured mapCategory output only — not a keyword deletion filter. */
export function classifyStructuredInventory(
  event: Pick<NaEvent, 'category'>
): StructuredInventoryClass {
  if (
    event.category === 'concert' ||
    event.category === 'theater' ||
    event.category === 'festival' ||
    event.category === 'party' ||
    event.category === 'cinema'
  ) {
    return 'LIVE_EVENT'
  }
  if (event.category === 'exhibition') return 'MUSEUM_ADMISSION'
  return 'UNKNOWN'
}
