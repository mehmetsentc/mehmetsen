import { describe, expect, it } from 'vitest'
import {
  extractCategoryOptions,
  filterCityEvents,
  resolveEventFilterCategory,
} from '@/lib/cityEventFilters'
import type { NaEvent } from '@/types/event'

const AUG_10_2026_NOON_TR = '2026-08-10T09:00:00.000Z'

function makeEvent(overrides: Partial<NaEvent> & Pick<NaEvent, 'startsAt'>): NaEvent {
  return {
    id: 'test-event',
    title: 'Test',
    description: '',
    city: 'Çanakkale',
    citySlug: 'canakkale',
    venue: 'Test Venue',
    category: 'exhibition',
    status: 'published',
    createdAt: AUG_10_2026_NOON_TR,
    ...overrides,
  }
}

describe('extractCategoryOptions', () => {
  it('returns only categories present in events, preserving canonical order', () => {
    const events = [
      makeEvent({ id: 'cinema-1', category: 'cinema', startsAt: '2026-08-10T18:00:00.000Z' }),
      makeEvent({ id: 'sergi-1', category: 'exhibition', startsAt: '2026-08-11T10:00:00.000Z' }),
    ]

    expect(extractCategoryOptions(events).map((c) => c.id)).toEqual(['exhibition', 'cinema'])
  })

  it('includes Diğer only when other-category events exist', () => {
    const withOther = [
      makeEvent({ id: 'other-1', category: 'other', startsAt: '2026-08-10T18:00:00.000Z' }),
    ]
    const withoutOther = [
      makeEvent({ id: 'concert-1', category: 'concert', startsAt: '2026-08-10T18:00:00.000Z' }),
    ]

    expect(extractCategoryOptions(withOther).some((c) => c.id === 'other')).toBe(true)
    expect(extractCategoryOptions(withoutOther).some((c) => c.id === 'other')).toBe(false)
  })

  it('omits empty categories like Konser when no concert events', () => {
    const events = [
      makeEvent({ id: 'cinema-1', category: 'cinema', startsAt: '2026-08-10T18:00:00.000Z' }),
    ]

    expect(extractCategoryOptions(events).map((c) => c.label)).toEqual(['Sinema'])
  })

  it('detects Sinema from tags when category field is other', () => {
    const events = [
      makeEvent({
        id: 'paribu-1',
        category: 'other',
        tags: ['Sinema', 'Komedi'],
        source: 'paribu-cineverse',
        startsAt: '2026-08-10T18:00:00.000Z',
      }),
      makeEvent({ id: 'sergi-1', category: 'exhibition', startsAt: '2026-08-11T10:00:00.000Z' }),
    ]

    expect(extractCategoryOptions(events).map((c) => c.id)).toEqual(['exhibition', 'cinema'])
  })

  it('detects Sinema from paribu source when category is missing', () => {
    const event = makeEvent({
      id: 'paribu-legacy',
      category: 'other',
      source: 'paribu-cineverse',
      tags: ['Aksiyon'],
      startsAt: '2026-08-10T18:00:00.000Z',
    })

    expect(resolveEventFilterCategory(event)).toBe('cinema')
    expect(extractCategoryOptions([event]).map((c) => c.label)).toEqual(['Sinema'])
  })
})

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

  it('Sinema filter matches tag-only Paribu cinema events', () => {
    const cinema = makeEvent({
      id: 'paribu-tag',
      category: 'other',
      tags: ['Sinema'],
      source: 'paribu-cineverse',
      startsAt: '2026-08-10T18:00:00.000Z',
    })
    const concert = makeEvent({
      id: 'concert',
      category: 'concert',
      startsAt: '2026-08-10T20:00:00.000Z',
    })

    const filtered = filterCityEvents(
      [cinema, concert],
      { dateFilter: 'all', category: 'cinema', venue: null, districtSlug: null },
      AUG_10_2026_NOON_TR
    )

    expect(filtered.map((e) => e.id)).toEqual(['paribu-tag'])
  })
})
