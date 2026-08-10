import { describe, expect, it } from 'vitest'
import { filterCityEvents } from '@/lib/cityEventFilters'
import type { NaEvent } from '@/types/event'

const AUG_10_2026_NOON_TR = '2026-08-10T09:00:00.000Z'

function makeEvent(overrides: Partial<NaEvent> & Pick<NaEvent, 'startsAt'>): NaEvent {
  return {
    id: 'test-event',
    title: 'Test',
    city: 'Çanakkale',
    citySlug: 'canakkale',
    category: 'exhibition',
    status: 'published',
    ...overrides,
  }
}

describe('filterCityEvents dateFilter', () => {
  it('Bugün excludes exhibitions that started in July even if still running', () => {
    const julyExhibition = makeEvent({
      id: 'july-exhibition',
      startsAt: '2026-07-01T07:00:00.000Z',
      endsAt: '2026-08-31T18:00:00.000Z',
      category: 'exhibition',
    })
    const todayExhibition = makeEvent({
      id: 'today-exhibition',
      startsAt: '2026-08-10T16:45:00.000Z',
      endsAt: '2026-08-10T20:00:00.000Z',
      category: 'exhibition',
    })

    const filtered = filterCityEvents(
      [julyExhibition, todayExhibition],
      { dateFilter: 'today', category: 'exhibition', venue: null, districtSlug: null },
      AUG_10_2026_NOON_TR
    )

    expect(filtered.map((e) => e.id)).toEqual(['today-exhibition'])
  })

  it('Bugün + Sergi keeps only exhibitions starting today', () => {
    const concertToday = makeEvent({
      id: 'concert-today',
      startsAt: '2026-08-10T18:00:00.000Z',
      category: 'concert',
    })
    const sergiToday = makeEvent({
      id: 'sergi-today',
      startsAt: '2026-08-10T10:00:00.000Z',
      category: 'exhibition',
    })

    const filtered = filterCityEvents(
      [concertToday, sergiToday],
      { dateFilter: 'today', category: 'exhibition', venue: null, districtSlug: null },
      AUG_10_2026_NOON_TR
    )

    expect(filtered.map((e) => e.id)).toEqual(['sergi-today'])
  })

  it('Yarın matches only events whose resolved start is tomorrow (Istanbul)', () => {
    const tomorrowEvent = makeEvent({
      id: 'tomorrow',
      startsAt: '2026-08-11T15:00:00.000Z',
    })
    const todayEvent = makeEvent({
      id: 'today',
      startsAt: '2026-08-10T18:00:00.000Z',
    })

    const filtered = filterCityEvents(
      [tomorrowEvent, todayEvent],
      { dateFilter: 'tomorrow', category: null, venue: null, districtSlug: null },
      AUG_10_2026_NOON_TR
    )

    expect(filtered.map((e) => e.id)).toEqual(['tomorrow'])
  })
})
