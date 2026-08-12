import { extractDistrictSlugFromText } from '@/constants/cities'
import {
  addIstanbulCalendarDays,
  compareIstanbulCalendarDays,
  getIstanbulDayOfWeek,
  getIstanbulTodayStartIso,
  istanbulCalendarParts,
  isSameIstanbulCalendarDay,
  isSameOrAfterIstanbulCalendarDay,
  resolveEventSchedule,
} from '@/lib/annualEventDates'
import { EVENT_CATEGORIES, isEventUpcoming } from '@/lib/eventUtils'
import type { EventCategory, NaEvent } from '@/types/event'

export type CityEventDateFilter = 'all' | 'today' | 'tomorrow' | 'thisWeek'
export type CityEventSort = 'date' | 'title' | 'rating'
export type CityEventViewMode = 'grid' | 'list'
export type CityEventTimeRange = 'upcoming' | 'past'

export interface CityEventFilterState {
  dateFilter: CityEventDateFilter
  category: EventCategory | null
  venue: string | null
  districtSlug: string | null
}

export const DEFAULT_CITY_EVENT_FILTERS: CityEventFilterState = {
  dateFilter: 'all',
  category: null,
  venue: null,
  districtSlug: null,
}

export function getEventDistrictSlug(event: NaEvent): string | null {
  if (event.districtSlug?.trim()) return event.districtSlug.trim().toLowerCase()
  const text = [event.venue, event.address, event.city].filter(Boolean).join(' ')
  if (!text.trim()) return null
  return extractDistrictSlugFromText(text)
}

const CINEMA_TAG_HINTS = new Set(['sinema', 'film', 'cinema', 'movie'])

function tagIndicatesCinema(tags?: string[]): boolean {
  if (!Array.isArray(tags)) return false
  return tags.some((tag) => CINEMA_TAG_HINTS.has(tag.trim().toLocaleLowerCase('tr-TR')))
}

function isParibuCinemaEvent(event: NaEvent): boolean {
  const source = (event.source ?? '').toLocaleLowerCase('tr-TR')
  const provider = (event.provider ?? '').toLocaleLowerCase('tr-TR')
  return (
    source.includes('paribu') ||
    source.includes('cineverse') ||
    provider.includes('paribu') ||
    provider.includes('cineverse')
  )
}

/**
 * Effective category for city filters — uses tags/source when the stored
 * `category` field is stale (e.g. Paribu rows tagged "Sinema" but saved as other).
 */
export function resolveEventFilterCategory(event: NaEvent): EventCategory {
  if (event.category === 'cinema') return 'cinema'
  if (tagIndicatesCinema(event.tags)) return 'cinema'
  if (isParibuCinemaEvent(event)) return 'cinema'
  return event.category ?? 'other'
}

/**
 * Tümü on Yaklaşan: today + future, or multi-day still running
 * (end calendar day ≥ today). Fully ended before today → false.
 */
export function matchesCityEventUpcomingAllDateFilter(
  event: NaEvent,
  nowIso: string = new Date().toISOString()
): boolean {
  return isEventUpcoming(event, nowIso)
}

/**
 * Late-night cinema endsAt often spills a few hours past midnight (last seans + runtime).
 * Those should not count as "happening" on the next Istanbul calendar day.
 */
const LATE_NIGHT_SPILL_END_HOUR = 6

/**
 * True when the event occurs on the given Istanbul calendar day:
 * - resolved start falls on that day, or
 * - multi-day / ongoing: started before the day and still active on it
 *   (excluding previous-day late-night endsAt spill before 06:00).
 */
export function eventOccursOnIstanbulCalendarDay(
  startsAt: string,
  endsAt: string | undefined,
  dayIso: string
): boolean {
  if (isSameIstanbulCalendarDay(startsAt, dayIso)) return true

  const endIso = endsAt?.trim()
  if (!endIso) return false

  if (compareIstanbulCalendarDays(startsAt, dayIso) >= 0) return false
  if (compareIstanbulCalendarDays(endIso, dayIso) < 0) return false

  // Previous evening show ending shortly after midnight → not "tomorrow".
  if (
    compareIstanbulCalendarDays(endIso, dayIso) === 0 &&
    istanbulCalendarParts(endIso).hour < LATE_NIGHT_SPILL_END_HOUR &&
    isSameIstanbulCalendarDay(startsAt, addIstanbulCalendarDays(dayIso, -1))
  ) {
    return false
  }

  return true
}

/** Match sidebar date chips by Istanbul calendar day (Bugün = start-only; Yarın = start or spanning). */
export function matchesCityEventDateFilter(
  event: NaEvent,
  filter: CityEventDateFilter,
  nowIso: string = new Date().toISOString(),
  options?: { timeRange?: CityEventTimeRange }
): boolean {
  if (filter === 'all') {
    if (options?.timeRange === 'upcoming') {
      return matchesCityEventUpcomingAllDateFilter(event, nowIso)
    }
    return true
  }

  const { startsAt, endsAt } = resolveEventSchedule(event, nowIso)

  switch (filter) {
    case 'today':
      // Strict: only events whose start is today (long July exhibitions stay out).
      return isSameIstanbulCalendarDay(startsAt, nowIso)
    case 'tomorrow': {
      // Istanbul calendar "Yarın": starts tomorrow, or still running through tomorrow.
      const tomorrowStart = addIstanbulCalendarDays(getIstanbulTodayStartIso(nowIso), 1)
      return eventOccursOnIstanbulCalendarDay(startsAt, endsAt, tomorrowStart)
    }
    case 'thisWeek': {
      const todayStart = getIstanbulTodayStartIso(nowIso)
      const weekStart = addIstanbulCalendarDays(todayStart, -getIstanbulDayOfWeek(nowIso))
      const weekEnd = addIstanbulCalendarDays(weekStart, 6)
      return (
        isSameOrAfterIstanbulCalendarDay(startsAt, weekStart) &&
        isSameOrAfterIstanbulCalendarDay(weekEnd, startsAt)
      )
    }
    default:
      return true
  }
}

export function filterCityEvents(
  events: NaEvent[],
  filters: CityEventFilterState,
  nowIso: string = new Date().toISOString(),
  options?: { timeRange?: CityEventTimeRange }
): NaEvent[] {
  return events.filter((event) => {
    if (
      filters.category &&
      resolveEventFilterCategory(event) !== filters.category
    ) {
      return false
    }

    if (filters.venue && event.venue !== filters.venue) return false

    if (filters.districtSlug) {
      const slug = getEventDistrictSlug(event)
      if (slug !== filters.districtSlug) return false
    }

    if (!matchesCityEventDateFilter(event, filters.dateFilter, nowIso, options)) return false

    return true
  })
}

export function sortCityEvents(events: NaEvent[], sort: CityEventSort): NaEvent[] {
  const copy = [...events]
  switch (sort) {
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'tr'))
    case 'rating':
      return copy.sort((a, b) => {
        const scoreA = (a.averageRating ?? 0) * (a.ratingCount ?? 0)
        const scoreB = (b.averageRating ?? 0) * (b.ratingCount ?? 0)
        if (scoreB !== scoreA) return scoreB - scoreA
        return a.startsAt.localeCompare(b.startsAt)
      })
    case 'date':
    default:
      return copy.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  }
}

/** Categories present in the current event list — "Diğer" only when needed. */
export function extractCategoryOptions(
  events: NaEvent[]
): Array<{ id: EventCategory; label: string }> {
  const present = new Set<EventCategory>()
  for (const event of events) {
    present.add(resolveEventFilterCategory(event))
  }
  return EVENT_CATEGORIES.filter((cat) => cat.id !== 'other' && present.has(cat.id)).concat(
    present.has('other') ? [{ id: 'other' as const, label: 'Diğer' }] : []
  )
}

export function extractVenueOptions(events: NaEvent[]): string[] {
  const venues = new Set<string>()
  for (const event of events) {
    const v = event.venue?.trim()
    if (v) venues.add(v)
  }
  return [...venues].sort((a, b) => a.localeCompare(b, 'tr'))
}

export function extractDistrictOptions(
  events: NaEvent[],
  districts: Array<{ slug: string; name: string }>
): Array<{ slug: string; name: string }> {
  const slugs = new Set<string>()
  for (const event of events) {
    const slug = getEventDistrictSlug(event)
    if (slug) slugs.add(slug)
  }
  return districts.filter((d) => slugs.has(d.slug))
}

/** Featured / popular strip — upcoming-start only; rating-backed when available, else soonest. */
export function pickFeaturedEvents(
  events: NaEvent[],
  limit = 8,
  nowIso: string = new Date().toISOString()
): NaEvent[] {
  const upcoming = events.filter((e) => isEventUpcoming(e, nowIso))
  const rated = upcoming.filter((e) => (e.ratingCount ?? 0) > 0)
  if (rated.length >= 3) {
    return sortCityEvents(rated, 'rating').slice(0, limit)
  }
  return sortCityEvents(upcoming, 'date').slice(0, limit)
}

export function countActiveFilters(filters: CityEventFilterState): number {
  let n = 0
  if (filters.dateFilter !== 'all') n++
  if (filters.category) n++
  if (filters.venue) n++
  if (filters.districtSlug) n++
  return n
}
