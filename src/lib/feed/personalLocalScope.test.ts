import { describe, expect, it } from 'vitest'
import {
  CITY_INTEREST_PREFIX,
  FOREIGN_CITY_ALLOW_MIN_SCORE,
  applyPersonalLocationToContext,
  cityInterestKey,
  extraAllowedLocalCities,
  filterPersonalLocalInventory,
  isPersonalLocalAllowed,
  parseCityAffinities,
  personalLocalScopeFromContext,
  resolveHomeCity,
} from './personalLocalScope'
import type { FeedUserContext } from '@/types/smartFeed'

function ctx(partial: Partial<FeedUserContext> = {}): FeedUserContext {
  return {
    userId: 'u1',
    isSynthetic: false,
    explicitInterests: [],
    behavioralInterests: new Map(),
    publisherAffinities: new Map(),
    followedPublisherIds: new Set(),
    negativePreferences: [],
    city: null,
    districtSlug: null,
    ...partial,
  }
}

describe('personal local scope — home city', () => {
  it('prefers profile city over request and learned affinity', () => {
    expect(
      resolveHomeCity({
        profileCity: 'Canakkale',
        requestCity: 'izmir',
        affinities: new Map([['istanbul', 1]]),
      })
    ).toBe('canakkale')
  })

  it('uses request city when profile is empty', () => {
    expect(resolveHomeCity({ requestCity: 'antalya' })).toBe('antalya')
  })

  it('learns home city from dominant affinity when nothing is set', () => {
    expect(
      resolveHomeCity({
        affinities: new Map([
          ['eskisehir', 0.22],
          ['bursa', 0.81],
        ]),
      })
    ).toBe('bursa')
  })

  it('does not invent a home city from a weak affinity', () => {
    expect(resolveHomeCity({ affinities: new Map([['van', 0.2]]) })).toBeNull()
  })
})

describe('personal local scope — Sana Özel inventory', () => {
  it('keeps national rows and home-city locals', () => {
    const scope = personalLocalScopeFromContext(ctx({ city: 'canakkale' }))
    expect(isPersonalLocalAllowed({ citySlug: null }, scope)).toBe(true)
    expect(isPersonalLocalAllowed({ citySlug: 'canakkale', category: 'yerel-gundem' }, scope)).toBe(true)
    expect(isPersonalLocalAllowed({ citySlug: 'istanbul', category: 'siyaset' }, scope)).toBe(true)
  })

  it('drops other cities when the user has not read them', () => {
    const scope = personalLocalScopeFromContext(ctx({ city: 'canakkale' }))
    expect(isPersonalLocalAllowed({ citySlug: 'izmir', source: 'LOCAL' }, scope)).toBe(false)
    const kept = filterPersonalLocalInventory(
      [
        { articleId: 'n1', citySlug: null, category: 'gundem' },
        { articleId: 'c1', citySlug: 'canakkale', source: 'LOCAL' },
        { articleId: 'i1', citySlug: 'izmir', category: 'yerel-gundem' },
        { articleId: 'nat', citySlug: 'izmir', category: 'siyaset' },
      ],
      'personal',
      scope
    )
    expect(kept.map((r) => r.articleId)).toEqual(['n1', 'c1', 'nat'])
  })

  it('allows a foreign city only after scored local reads', () => {
    const scope = personalLocalScopeFromContext(
      ctx({
        city: 'canakkale',
        behavioralInterests: new Map([
          [cityInterestKey('izmir'), FOREIGN_CITY_ALLOW_MIN_SCORE],
          [cityInterestKey('van'), 0.1],
        ]),
      })
    )
    expect(isPersonalLocalAllowed({ citySlug: 'izmir', source: 'LOCAL' }, scope)).toBe(true)
    expect(isPersonalLocalAllowed({ citySlug: 'van', category: 'yerel-gundem' }, scope)).toBe(false)
    expect([...scope.extraCities]).toEqual(['izmir'])
  })

  it('without a home city, suppresses unread city-tagged locals', () => {
    const scope = personalLocalScopeFromContext(ctx())
    expect(isPersonalLocalAllowed({ citySlug: 'ankara', source: 'LOCAL' }, scope)).toBe(false)
    expect(isPersonalLocalAllowed({ citySlug: null }, scope)).toBe(true)
  })

  it('does not filter Yerel tab inventory', () => {
    const scope = personalLocalScopeFromContext(ctx({ city: 'canakkale' }))
    const rows = [{ citySlug: 'izmir' }]
    expect(filterPersonalLocalInventory(rows, 'local', scope)).toEqual(rows)
  })

  it('caps extra cities at two highest affinities', () => {
    const extra = extraAllowedLocalCities(
      'canakkale',
      new Map([
        ['izmir', 0.9],
        ['bursa', 0.7],
        ['van', 0.6],
      ])
    )
    expect(extra).toEqual(['izmir', 'bursa'])
  })
})

describe('personal local scope — context merge', () => {
  it('writes learned/request home onto user context', () => {
    const next = applyPersonalLocationToContext(
      ctx({
        behavioralInterests: new Map([[`${CITY_INTEREST_PREFIX}trabzon`, 0.7]]),
      }),
      null
    )
    expect(next.city).toBe('trabzon')
  })

  it('parses only city: interest keys', () => {
    const affinities = parseCityAffinities(
      new Map([
        ['cat:gundem', 0.9],
        [cityInterestKey('Muğla'), 0.5],
      ])
    )
    expect([...affinities.keys()]).toEqual(['mugla'])
  })
})
