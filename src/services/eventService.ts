import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { devLog, withTimeout } from '@/lib/asyncUtils'
import { enqueueFirestoreRead } from '@/lib/firestoreQueue'
import { resolveEventSchedule } from '@/lib/annualEventDates'
import {
  getUpcomingStartsAtLowerBound,
  isEventUpcoming,
  PAST_EVENT_LOOKBACK_MS,
} from '@/lib/eventUtils'
import type { EventCategory, EventReview, EventTimelineStatus, NaEvent } from '@/types/event'

export const EVENT_PAGE_SIZE = 12
/** City etkinlik pages load the full local catalog in one request (no infinite scroll). */
const CITY_EVENT_FETCH_TARGET = 120
const FETCH_BATCH_SIZE = 50
const QUERY_TIMEOUT_MS = 15_000

export type EventTimeRange = 'upcoming' | 'past'
export type EventsDataSource = 'firestore' | 'live'

export interface GetEventsOptions {
  citySlug?: string
  category?: EventCategory
  /** Upcoming (default) or past events. */
  timeRange?: EventTimeRange
  cursor?: QueryDocumentSnapshot
}

export interface GetEventsResult {
  events: NaEvent[]
  lastDoc: QueryDocumentSnapshot | null
  hasMore: boolean
  source: EventsDataSource
}

function toEvent(d: QueryDocumentSnapshot): NaEvent {
  return { id: d.id, ...d.data() } as NaEvent
}

function isVisible(event: NaEvent): boolean {
  return event.status !== 'draft' && event.status !== 'cancelled'
}

function effectiveTimelineStatus(event: NaEvent, nowIso: string): EventTimelineStatus {
  // Always derive from actual date — Firestore timelineStatus field can be stale
  return isEventUpcoming(event, nowIso) ? 'upcoming' : 'past'
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

/** Client-side filter for live aggregate results and Firestore fallback scans. */
export function filterEventsForQuery(
  events: NaEvent[],
  options: {
    citySlug?: string
    category?: EventCategory
    timeRange: EventTimeRange
    nowIso?: string
  }
): NaEvent[] {
  const nowIso = options.nowIso ?? new Date().toISOString()
  const { citySlug, category, timeRange } = options

  return events
    .filter(isVisible)
    .filter((event) => matchesTimeRange(event, timeRange, nowIso))
    .filter((event) => !citySlug || event.citySlug === citySlug)
    .filter((event) => !category || event.category === category)
}

export function sortEventsByTimeRange(
  events: NaEvent[],
  timeRange: EventTimeRange
): NaEvent[] {
  const dir = timeRange === 'past' ? -1 : 1
  return [...events].sort((a, b) => dir * a.startsAt.localeCompare(b.startsAt))
}


function buildEventQueryConstraints(options: {
  citySlug?: string
  category?: EventCategory
  timeRange: EventTimeRange
  nowIso: string
  sortDir: 'asc' | 'desc'
  pageSize: number
  cursor?: QueryDocumentSnapshot | null
}): Parameters<typeof query>[1][] {
  const { citySlug, category, timeRange, nowIso, sortDir, pageSize, cursor } = options
  const constraints: Parameters<typeof query>[1][] = []

  // Equality filters must precede range/orderBy on startsAt (Firestore composite indexes).
  if (citySlug) constraints.push(where('citySlug', '==', citySlug))
  if (category) constraints.push(where('category', '==', category))

  if (timeRange === 'upcoming') {
    constraints.push(where('startsAt', '>=', getUpcomingStartsAtLowerBound(nowIso)))
  } else {
    const pastLower = new Date(new Date(nowIso).getTime() - PAST_EVENT_LOOKBACK_MS).toISOString()
    constraints.push(where('startsAt', '<', nowIso))
    constraints.push(where('startsAt', '>=', pastLower))
  }

  constraints.push(orderBy('startsAt', sortDir))
  if (cursor) constraints.push(startAfter(cursor))
  constraints.push(limit(pageSize))
  return constraints
}

async function fetchAnnualCityEvents(citySlug: string): Promise<NaEvent[]> {
  const q = query(
    collection(db, Collections.EVENTS),
    where('citySlug', '==', citySlug),
    where('recurrence', '==', 'annual'),
    limit(150)
  )
  const snap = await withTimeout(
    enqueueFirestoreRead(() => getDocs(q)),
    QUERY_TIMEOUT_MS,
    'events-annual'
  )
  return snap.docs.map(toEvent).filter(isVisible)
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

function collectVisibleEvents(
  docs: QueryDocumentSnapshot[],
  options: {
    citySlug?: string
    category?: EventCategory
    timeRange: EventTimeRange
    nowIso: string
  },
  seen: Set<string>,
  bucket: NaEvent[]
): void {
  const { citySlug, category, timeRange, nowIso } = options
  for (const docSnap of docs) {
    const event = toEvent(docSnap)
    if (!isVisible(event)) continue
    if (!matchesTimeRange(event, timeRange, nowIso)) continue
    if (citySlug && event.citySlug !== citySlug) continue
    if (category && event.category !== category) continue
    if (seen.has(event.id)) continue
    seen.add(event.id)
    bucket.push(event)
  }
}

/**
 * Keeps reading Firestore pages until `targetCount` visible events are collected
 * or the query is exhausted. Avoids returning sparse pages when cancelled/past
 * ticket rows dominate early `startsAt` ordering.
 */
async function fetchVisibleEventsPaginated(
  options: GetEventsOptions,
  nowIso: string,
  targetCount: number
): Promise<GetEventsResult> {
  const { citySlug, category, cursor: initialCursor } = options
  const timeRange = options.timeRange ?? 'upcoming'
  const sortDir = timeRange === 'past' ? 'desc' : 'asc'

  const seen = new Set<string>()
  const collected: NaEvent[] = []
  let cursor: QueryDocumentSnapshot | undefined = initialCursor
  let lastDoc: QueryDocumentSnapshot | null = null
  let exhausted = false

  while (collected.length < targetCount) {
    const constraints = buildEventQueryConstraints({
      citySlug,
      category,
      timeRange,
      nowIso,
      sortDir,
      pageSize: FETCH_BATCH_SIZE,
      cursor,
    })

    const snap = await withTimeout(
      enqueueFirestoreRead(() =>
        getDocs(query(collection(db, Collections.EVENTS), ...constraints))
      ),
      QUERY_TIMEOUT_MS,
      'events-paginated'
    )

    if (snap.empty) {
      exhausted = true
      break
    }

    lastDoc = snap.docs[snap.docs.length - 1] ?? null
    collectVisibleEvents(
      snap.docs,
      { citySlug, category, timeRange, nowIso },
      seen,
      collected
    )

    if (snap.docs.length < FETCH_BATCH_SIZE) {
      exhausted = true
      break
    }

    cursor = lastDoc ?? undefined
  }

  let events = sortEventsByTimeRange(collected, timeRange).slice(0, targetCount)

  if (timeRange === 'upcoming' && citySlug && !category && !initialCursor) {
    try {
      const annual = await fetchAnnualCityEvents(citySlug)
      events = sortEventsByTimeRange(
        mergeEventLists(events, annual).filter((event) =>
          matchesTimeRange(event, timeRange, nowIso)
        ),
        timeRange
      ).slice(0, targetCount)
    } catch (annualError) {
      console.warn('[eventService] annual city events fetch failed:', annualError)
    }
  }

  return {
    events,
    lastDoc,
    hasMore: !exhausted && collected.length >= targetCount,
    source: 'firestore',
  }
}

async function runOrderedFallback(
  options: GetEventsOptions,
  nowIso: string,
  reason: string
): Promise<GetEventsResult> {
  const { citySlug, category, cursor } = options
  const timeRange = options.timeRange ?? 'upcoming'
  const targetCount =
    citySlug && !category && !cursor ? CITY_EVENT_FETCH_TARGET : EVENT_PAGE_SIZE * 4

  devLog('eventService', 'ordered fallback', { reason, citySlug, category, timeRange, targetCount })

  try {
    return await fetchVisibleEventsPaginated(options, nowIso, targetCount)
  } catch (fallbackError) {
    console.error('[eventService] ordered fallback paginated fetch failed:', fallbackError)
    throw fallbackError
  }
}

export const eventService = {
  /**
   * Cultural events from the synced Firestore collection — upcoming soonest
   * first, or past events newest-first. Falls back to a client-side scan when
   * indexed queries return nothing (legacy docs) or fail (missing index).
   */
  async getEvents(options: GetEventsOptions = {}): Promise<GetEventsResult> {
    const nowIso = new Date().toISOString()
    const { citySlug, category, cursor } = options
    const timeRange = options.timeRange ?? 'upcoming'

    devLog('eventService', 'getEvents', { citySlug, category, timeRange, hasCursor: !!cursor })

    const targetCount =
      citySlug && !category && !cursor ? CITY_EVENT_FETCH_TARGET : EVENT_PAGE_SIZE

    try {
      const result = await fetchVisibleEventsPaginated(options, nowIso, targetCount)

      if (result.events.length === 0 && !cursor) {
        return runOrderedFallback(options, nowIso, 'empty-primary')
      }

      return result
    } catch (error) {
      console.warn('[eventService] getEvents failed, ordered fallback:', error)

      try {
        return await runOrderedFallback(options, nowIso, 'query-error')
      } catch (fallbackError) {
        console.error('[eventService] getEvents fallback failed:', fallbackError)
        throw error
      }
    }
  },

  async getRecentEventCities(
    scanLimit = 120
  ): Promise<Array<{ slug: string; name: string }>> {
    try {
      const q = query(
        collection(db, Collections.EVENTS),
        where('timelineStatus', '==', 'upcoming'),
        orderBy('startsAt', 'asc'),
        limit(scanLimit)
      )
      const snap = await withTimeout(
        enqueueFirestoreRead(() => getDocs(q)),
        QUERY_TIMEOUT_MS,
        'event-cities'
      )

      const cities: Array<{ slug: string; name: string }> = []
      const seen = new Set<string>()

      for (const docSnap of snap.docs) {
        const data = docSnap.data() as Partial<NaEvent>
        const slug = data.citySlug?.trim()
        if (!slug || seen.has(slug)) continue
        seen.add(slug)
        cities.push({ slug, name: data.city?.trim() || slug })
      }

      return cities
    } catch (error) {
      console.warn('[eventService] getRecentEventCities failed:', error)
      return []
    }
  },

  async getEventReviews(eventId: string, max = 20): Promise<EventReview[]> {
    try {
      const q = query(
        collection(db, Collections.EVENT_REVIEWS),
        where('eventId', '==', eventId),
        orderBy('createdAt', 'desc'),
        limit(max)
      )
      const snap = await withTimeout(
        enqueueFirestoreRead(() => getDocs(q)),
        QUERY_TIMEOUT_MS,
        'event-reviews'
      )
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventReview)
    } catch (error) {
      console.warn('[eventService] getEventReviews failed:', error)
      return []
    }
  },

  async rateEvent(
    eventId: string,
    userId: string,
    userDisplayName: string,
    rating: number,
    comment = ''
  ): Promise<string> {
    const clampedRating = Math.min(5, Math.max(1, Math.round(rating)))
    const now = new Date().toISOString()

    const existingQ = query(
      collection(db, Collections.EVENT_REVIEWS),
      where('eventId', '==', eventId),
      where('userId', '==', userId),
      limit(1)
    )
    const existingSnap = await getDocs(existingQ)

    if (!existingSnap.empty) {
      const reviewRef = existingSnap.docs[0].ref
      await updateDoc(reviewRef, {
        rating: clampedRating,
        comment: comment.trim(),
        updatedAt: now,
      })
      await eventService.recalculateEventRatings(eventId)
      return reviewRef.id
    }

    const ref = await addDoc(collection(db, Collections.EVENT_REVIEWS), {
      eventId,
      userId,
      userDisplayName,
      rating: clampedRating,
      comment: comment.trim(),
      createdAt: now,
      updatedAt: now,
    })

    await eventService.recalculateEventRatings(eventId)
    return ref.id
  },

  async recalculateEventRatings(eventId: string): Promise<void> {
    const q = query(
      collection(db, Collections.EVENT_REVIEWS),
      where('eventId', '==', eventId)
    )
    const snap = await getDocs(q)
    if (snap.empty) return

    let total = 0
    let reviewCount = 0
    for (const d of snap.docs) {
      const data = d.data() as Partial<EventReview>
      total += data.rating ?? 0
      if (data.comment?.trim()) reviewCount += 1
    }

    const ratingCount = snap.size
    const averageRating = Math.round((total / ratingCount) * 10) / 10

    await updateDoc(doc(db, Collections.EVENTS, eventId), {
      averageRating,
      ratingCount,
      reviewCount,
    })
  },
}
