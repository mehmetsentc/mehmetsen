import { unstable_cache } from 'next/cache'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import {
  addIstanbulCalendarDays,
  getIstanbulTodayStartIso,
  isSameOrAfterIstanbulCalendarDay,
  resolveEventSchedule,
} from '@/lib/annualEventDates'
import { resolveEventFilterCategory } from '@/lib/cityEventFilters'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  getUpcomingStartsAtLowerBound,
  isEventUpcoming,
  PAST_EVENT_LOOKBACK_MS,
} from '@/lib/eventUtils'
import type { EventTimeRange } from '@/services/eventService'
import type { NaEvent } from '@/types/event'

const CITY_EVENT_FETCH_TARGET = 120
const FETCH_BATCH_SIZE = 50
const CITY_CINEMA_FEED_LIMIT = 8
const CITY_CINEMA_NEAR_TERM_DAYS = 7

function isNearTermCityEvent(event: NaEvent, nowIso: string): boolean {
  const { startsAt } = resolveEventSchedule(event, nowIso)
  const todayStart = getIstanbulTodayStartIso(nowIso)
  const nearEnd = addIstanbulCalendarDays(todayStart, CITY_CINEMA_NEAR_TERM_DAYS)
  return (
    isSameOrAfterIstanbulCalendarDay(startsAt, todayStart) &&
    isSameOrAfterIstanbulCalendarDay(nearEnd, startsAt)
  )
}

function filterCityCinemaEvents(events: NaEvent[], nowIso: string): NaEvent[] {
  return events
    .filter((event) => resolveEventFilterCategory(event) === 'cinema')
    .filter((event) => isNearTermCityEvent(event, nowIso))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, CITY_CINEMA_FEED_LIMIT)
}

function isVisible(event: NaEvent): boolean {
  return event.status !== 'draft' && event.status !== 'cancelled'
}

function matchesTimeRange(event: NaEvent, timeRange: EventTimeRange, nowIso: string): boolean {
  if (timeRange === 'upcoming') {
    return isEventUpcoming(event, nowIso)
  }

  if (isEventUpcoming(event, nowIso)) return false

  const resolved = resolveEventSchedule(event, nowIso)
  const pastLower = new Date(new Date(nowIso).getTime() - PAST_EVENT_LOOKBACK_MS).toISOString()
  return resolved.startsAt >= pastLower
}

function sortEventsByTimeRange(events: NaEvent[], timeRange: EventTimeRange): NaEvent[] {
  const dir = timeRange === 'past' ? -1 : 1
  return [...events].sort((a, b) => dir * a.startsAt.localeCompare(b.startsAt))
}

function mergeEventLists(primary: NaEvent[], extra: NaEvent[]): NaEvent[] {
  const seen = new Set(primary.map((e) => e.id))
  const merged = [...primary]
  for (const event of extra) {
    if (!seen.has(event.id)) {
      seen.add(event.id)
      merged.push(event)
    }
  }
  return merged
}

function toEvent(doc: QueryDocumentSnapshot): NaEvent {
  return { id: doc.id, ...(doc.data() as Omit<NaEvent, 'id'>) }
}

/**
 * City etkinlik SSR prefetch — paginates past cancelled ticket stubs, merges
 * annual municipal + Troya docs, returns upcoming-first catalog for HTML seed.
 */
export async function getCityEventsServer(
  citySlug: string,
  timeRange: EventTimeRange = 'upcoming',
  targetCount = CITY_EVENT_FETCH_TARGET
): Promise<NaEvent[]> {
  try {
    const db = getAdminFirestore()
    const nowIso = new Date().toISOString()
    const sortDir = timeRange === 'past' ? 'desc' : 'asc'
    const seen = new Set<string>()
    const collected: NaEvent[] = []
    let lastDoc: QueryDocumentSnapshot | null = null

    for (let batch = 0; batch < 10 && collected.length < targetCount; batch++) {
      let q = db.collection(Collections.EVENTS).where('citySlug', '==', citySlug)

      if (timeRange === 'upcoming') {
        q = q.where('startsAt', '>=', getUpcomingStartsAtLowerBound(nowIso))
      } else {
        const pastLower = new Date(new Date(nowIso).getTime() - PAST_EVENT_LOOKBACK_MS).toISOString()
        q = q.where('startsAt', '<', nowIso).where('startsAt', '>=', pastLower)
      }

      q = q.orderBy('startsAt', sortDir).limit(FETCH_BATCH_SIZE)
      if (lastDoc) q = q.startAfter(lastDoc)

      const snap = await q.get()
      if (snap.empty) break

      for (const doc of snap.docs) {
        const event = toEvent(doc)
        if (!isVisible(event)) continue
        if (!matchesTimeRange(event, timeRange, nowIso)) continue
        if (seen.has(event.id)) continue
        seen.add(event.id)
        collected.push(event)
      }

      lastDoc = snap.docs[snap.docs.length - 1] ?? null
      if (snap.size < FETCH_BATCH_SIZE) break
    }

    let events = sortEventsByTimeRange(collected, timeRange).slice(0, targetCount)

    if (timeRange === 'upcoming') {
      try {
        const annualSnap = await db
          .collection(Collections.EVENTS)
          .where('citySlug', '==', citySlug)
          .where('recurrence', '==', 'annual')
          .limit(150)
          .get()

        const annual = annualSnap.docs.map(toEvent).filter(isVisible)
        events = sortEventsByTimeRange(
          mergeEventLists(events, annual).filter((event) =>
            matchesTimeRange(event, timeRange, nowIso)
          ),
          timeRange
        ).slice(0, targetCount)
      } catch (annualError) {
        console.warn('[eventService.server] annual city events fetch failed:', annualError)
      }
    }

    return events
  } catch (error) {
    console.warn('[eventService.server] getCityEventsServer failed:', error)
    return []
  }
}

/**
 * Ana etkinlik listesi için SSR prefetch — boş HTML + client fetch CLS’ini keser.
 */
const getCityCinemaEventsCached = unstable_cache(
  async (citySlug: string): Promise<NaEvent[]> => {
    const nowIso = new Date().toISOString()
    const events = await getCityEventsServer(citySlug, 'upcoming', 80)
    return filterCityCinemaEvents(events, nowIso)
  },
  ['city-cinema-events-v1'],
  { revalidate: 120, tags: ['city-events'] }
)

/** Today + near-term cinema rows for city Ana Feed (Paribu / Sinema tag).
 *  Cinema strip is Çanakkale-tenant only — national /yerel pages do not show it.
 */
export async function getCityCinemaEventsServer(citySlug: string): Promise<NaEvent[]> {
  const slug = citySlug.trim().toLowerCase()
  if (slug !== 'canakkale') return []
  return getCityCinemaEventsCached(slug)
}

export async function getUpcomingEventsServer(limitCount = 12): Promise<NaEvent[]> {
  try {
    const db = getAdminFirestore()
    const nowIso = new Date().toISOString()
    const snap = await db
      .collection(Collections.EVENTS)
      .where('startsAt', '>=', getUpcomingStartsAtLowerBound(nowIso))
      .orderBy('startsAt', 'asc')
      .limit(limitCount * 3)
      .get()

    return snap.docs
      .map(toEvent)
      .filter((event) => isVisible(event) && isEventUpcoming(event, nowIso))
      .slice(0, limitCount)
  } catch (error) {
    console.warn('[eventService.server] getUpcomingEventsServer failed:', error)
    return []
  }
}

/**
 * Single event lookup with optional city validation (prevents cross-city event leakage).
 */
export async function getCityEventById(id: string, citySlug?: string): Promise<NaEvent | null> {
  try {
    const db = getAdminFirestore()
    const doc = await db.collection(Collections.EVENTS).doc(id).get()
    if (!doc.exists) return null
    const event = { id: doc.id, ...(doc.data() as Omit<NaEvent, 'id'>) }
    if (citySlug) {
      const normalizedCity = citySlug.trim().toLowerCase()
      const eventCity = event.citySlug?.trim().toLowerCase()
      if (eventCity && eventCity !== normalizedCity) {
        return null
      }
    }
    return event
  } catch (error) {
    console.warn('[eventService.server] getCityEventById failed:', error)
    return null
  }
}

