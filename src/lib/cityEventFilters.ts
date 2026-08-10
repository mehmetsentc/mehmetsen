import {
  endOfDay,
  endOfWeek,
  startOfDay,
  startOfWeek,
} from 'date-fns'
import { extractDistrictSlugFromText } from '@/constants/cities'
import { isEventUpcoming } from '@/lib/eventUtils'
import type { EventCategory, NaEvent } from '@/types/event'

export type CityEventDateFilter = 'all' | 'today' | 'tomorrow' | 'thisWeek'
export type CityEventSort = 'date' | 'title' | 'rating'
export type CityEventViewMode = 'grid' | 'list'

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

function getDateRange(filter: CityEventDateFilter): { start: Date; end: Date } | null {
  const now = new Date()
  switch (filter) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) }
    case 'tomorrow': {
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return { start: startOfDay(tomorrow), end: endOfDay(tomorrow) }
    }
    case 'thisWeek':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      }
    default:
      return null
  }
}

export function filterCityEvents(
  events: NaEvent[],
  filters: CityEventFilterState
): NaEvent[] {
  const range = getDateRange(filters.dateFilter)

  return events.filter((event) => {
    if (filters.category && event.category !== filters.category) return false

    if (filters.venue && event.venue !== filters.venue) return false

    if (filters.districtSlug) {
      const slug = getEventDistrictSlug(event)
      if (slug !== filters.districtSlug) return false
    }

    if (range) {
      const start = new Date(event.startsAt)
      const end = new Date(event.endsAt ?? event.startsAt)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
      if (end < range.start || start > range.end) return false
    }

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
