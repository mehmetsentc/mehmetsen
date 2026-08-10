import {
  addIstanbulCalendarDays,
  getIstanbulTodayStartIso,
  isSameOrAfterIstanbulCalendarDay,
} from '@/lib/annualEventDates'
import { resolveEventFilterCategory } from '@/lib/cityEventFilters'
import { getUpcomingStartsAtLowerBound, isEventUpcoming } from '@/lib/eventUtils'
import type { NaEvent } from '@/types/event'

export type LocalCityEventsStripFilter = 'all' | 'cinema'

const CINEMA_NEAR_TERM_DAYS = 7
const STRIP_LIMIT = 10

/** Keep published upcoming events; optionally cinema-only for the next week. */
export function filterLocalCityStripEvents(
  events: NaEvent[],
  filter: LocalCityEventsStripFilter,
  nowIso: string = new Date().toISOString()
): NaEvent[] {
  const upcoming = events.filter(
    (event) => event.status !== 'cancelled' && isEventUpcoming(event, nowIso)
  )

  if (filter === 'all') {
    return upcoming.sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, STRIP_LIMIT)
  }

  const todayStart = getUpcomingStartsAtLowerBound(nowIso)
  const weekEnd = addIstanbulCalendarDays(getIstanbulTodayStartIso(nowIso), CINEMA_NEAR_TERM_DAYS)

  return upcoming
    .filter((event) => resolveEventFilterCategory(event) === 'cinema')
    .filter(
      (event) =>
        isSameOrAfterIstanbulCalendarDay(event.startsAt, todayStart) &&
        isSameOrAfterIstanbulCalendarDay(weekEnd, event.startsAt)
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, STRIP_LIMIT)
}
