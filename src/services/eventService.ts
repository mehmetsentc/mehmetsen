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
import {
  getUpcomingStartsAtLowerBound,
  isEventUpcoming,
} from '@/lib/eventUtils'
import type { EventCategory, EventReview, EventTimelineStatus, NaEvent } from '@/types/event'

export const EVENT_PAGE_SIZE = 12
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
  const eventDate = event.startsAt ?? ''
  const endDate = event.endsAt ?? eventDate

  if (timeRange === 'upcoming') {
    return isEventUpcoming(event, nowIso)
  }

  const threeDaysAgo = new Date(new Date(nowIso).getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  return endDate < nowIso && eventDate >= threeDaysAgo
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

async function runOrderedFallback(
  options: GetEventsOptions,
  nowIso: string,
  reason: string
): Promise<GetEventsResult> {
  const { citySlug, category, cursor } = options
  const timeRange = options.timeRange ?? 'upcoming'
  const sortDir = timeRange === 'past' ? 'desc' : 'asc'
  const FALLBACK_FETCH = EVENT_PAGE_SIZE * 4

  devLog('eventService', 'ordered fallback', { reason, citySlug, category, timeRange })

  const constraints: Parameters<typeof query>[1][] = []

  // Widen the window so multi-day events that already started still fetch.
  if (timeRange === 'upcoming') {
    constraints.push(where('startsAt', '>=', getUpcomingStartsAtLowerBound(nowIso)))
  } else {
    const threeDaysAgo = new Date(new Date(nowIso).getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
    constraints.push(where('startsAt', '<', nowIso))
    constraints.push(where('startsAt', '>=', threeDaysAgo))
  }

  constraints.push(orderBy('startsAt', sortDir))
  if (cursor) constraints.push(startAfter(cursor))
  constraints.push(limit(FALLBACK_FETCH))

  const snap = await withTimeout(
    enqueueFirestoreRead(() =>
      getDocs(query(collection(db, Collections.EVENTS), ...constraints))
    ),
    QUERY_TIMEOUT_MS,
    'events-fallback'
  )

  let events = filterEventsForQuery(snap.docs.map(toEvent), {
    citySlug,
    category,
    timeRange,
    nowIso,
  })
  events = events.slice(0, EVENT_PAGE_SIZE)

  return {
    events,
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
    hasMore: snap.docs.length === FALLBACK_FETCH,
    source: 'firestore',
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
    const sortDir = timeRange === 'past' ? 'desc' : 'asc'

    devLog('eventService', 'getEvents', { citySlug, category, timeRange, hasCursor: !!cursor })

    try {
      const constraints: Parameters<typeof query>[1][] = []

      if (timeRange === 'upcoming') {
        constraints.push(where('startsAt', '>=', getUpcomingStartsAtLowerBound(nowIso)))
      } else {
        // Past: ended, within last 3 days
        const threeDaysAgo = new Date(new Date(nowIso).getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
        constraints.push(where('startsAt', '<', nowIso))
        constraints.push(where('startsAt', '>=', threeDaysAgo))
      }

      if (citySlug) constraints.push(where('citySlug', '==', citySlug))
      if (category) constraints.push(where('category', '==', category))
      constraints.push(orderBy('startsAt', sortDir))
      if (cursor) constraints.push(startAfter(cursor))
      constraints.push(limit(EVENT_PAGE_SIZE))

      const q = query(collection(db, Collections.EVENTS), ...constraints)
      const snap = await withTimeout(
        enqueueFirestoreRead(() => getDocs(q)),
        QUERY_TIMEOUT_MS,
        'events'
      )

      const events = snap.docs
        .map(toEvent)
        .filter(isVisible)
        .filter((event) => matchesTimeRange(event, timeRange, nowIso))

      if (events.length === 0 && !cursor) {
        return runOrderedFallback(options, nowIso, 'empty-primary')
      }

      return {
        events,
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === EVENT_PAGE_SIZE,
        source: 'firestore',
      }
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
