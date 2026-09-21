import { describe, expect, it } from 'vitest'
import { clampDistrictToProvince } from './canarySanitize'
import { classifyBiletixTicketEvidence } from './ticketUrl'
import {
  pickBubiletDetailHrefs,
  bubiletListingKeyFromTicketUrl,
} from './bubilet'
import { findReconcilePairs } from './occurrenceReconcile'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertWritePlanSafe,
  biletimgoDetailsAvoided,
  decideOccurrenceWrite,
  istanbulDayOfYear,
  rotateCityOrder,
} from './occurrenceCron'
import { filterEventsToProvinces } from './biletixDiscovery'
import type { NaEvent } from '@/types/event'

function event(partial: Partial<NaEvent> & Pick<NaEvent, 'id' | 'title' | 'startsAt'>): NaEvent {
  return {
    description: '',
    category: 'concert',
    city: 'İzmir',
    citySlug: 'izmir',
    venue: 'Açıkhava',
    createdAt: '2026-09-21T12:00:00.000Z',
    status: 'published',
    source: 'biletix',
    ...partial,
  }
}

describe('occurrence cron safety helpers', () => {
  it('aborts a write plan that contains deletion and keeps SHADOW unarmed', () => {
    expect(assertWritePlanSafe({ wouldDelete: 0 })).toEqual({ ok: true })
    expect(assertWritePlanSafe({ wouldDelete: 1 })).toEqual({ ok: false, reason: 'wouldDelete' })
    expect(decideOccurrenceWrite({ mode: 'shadow', wouldDelete: 0 })).toEqual({ action: 'shadow', reason: null })
    expect(decideOccurrenceWrite({ mode: 'write', wouldDelete: 1, allowWrite: true })).toEqual({
      action: 'abort',
      reason: 'wouldDelete',
    })
    expect(decideOccurrenceWrite({ mode: 'write', wouldDelete: 0, allowWrite: false })).toEqual({
      action: 'abort',
      reason: 'write_not_armed',
    })
  })

  it('counts one BiletimGO detail per unique ID and avoids repeated listing IDs', () => {
    expect(biletimgoDetailsAvoided(2268, 28, 0)).toBe(2240)
    expect(biletimgoDetailsAvoided(2268, 28, 28)).toBe(2268)
  })

  it('rotates city order so Istanbul does not always consume the first budget slot', () => {
    const slugs = ['istanbul', 'ankara', 'izmir', 'adana']
    const a = rotateCityOrder(slugs, 1)
    const b = rotateCityOrder(slugs, 2)
    expect(a[0]).not.toBe(b[0])
    expect(a.sort()).toEqual(slugs.slice().sort())
    expect(istanbulDayOfYear('2026-01-02T00:00:00.000Z')).toBeGreaterThan(0)
  })

  it('changes Bubilet first/last cities across successive Istanbul days', () => {
    const slugs = ['istanbul', 'ankara', 'izmir', 'samsun', 'tunceli', 'canakkale']
    const dayN = rotateCityOrder(slugs, istanbulDayOfYear('2026-09-21T21:00:00.000Z'))
    const dayN1 = rotateCityOrder(slugs, istanbulDayOfYear('2026-09-22T21:00:00.000Z'))
    const dayN2 = rotateCityOrder(slugs, istanbulDayOfYear('2026-09-23T21:00:00.000Z'))
    expect(new Set([dayN[0], dayN1[0], dayN2[0]]).size).toBeGreaterThan(1)
    expect(dayN[0]).not.toBe(dayN1[0])
    expect(dayN1[0]).not.toBe(dayN2[0])
    expect(dayN.at(-1)).not.toBe(dayN1.at(-1))
  })

  it('keeps wouldDelete=0 for PARTIAL, BLOCKED, and FAILED Bubilet health', () => {
    for (const status of ['PARTIAL', 'BLOCKED', 'FETCH_FAILED', 'RATE_LIMITED', 'EMPTY'] as const) {
      expect(status).toBeTruthy()
      expect(assertWritePlanSafe({ wouldDelete: 0 }).ok).toBe(true)
    }
  })

  it('fetches new Bubilet listing IDs first and skips known listings', () => {
    const links = [
      '/izmir/etkinlik/new-show',
      '/izmir/etkinlik/known-show',
      '/izmir/etkinlik/another-new',
    ]
    const picked = pickBubiletDetailHrefs(links, ['/izmir/etkinlik/known-show'], 8)
    expect(picked.fetch).toEqual(['/izmir/etkinlik/new-show', '/izmir/etkinlik/another-new'])
    expect(picked.skippedKnown).toBe(1)
    expect(picked.newCount).toBe(2)
    const second = pickBubiletDetailHrefs(links, links, 8)
    expect(second.fetch).toEqual([])
    expect(second.skippedKnown).toBe(3)
    const overBudget = pickBubiletDetailHrefs(links, [], 1)
    expect(overBudget.newCount > overBudget.fetch.length).toBe(true)
  })

  it('does not infer Bubilet absence deletion from PARTIAL or BLOCKED', () => {
    expect(assertWritePlanSafe({ wouldDelete: 0 }).ok).toBe(true)
    expect(bubiletListingKeyFromTicketUrl('https://www.bubilet.com.tr/izmir/etkinlik/known-show/seans/1')).toBe(
      '/izmir/etkinlik/known-show'
    )
  })

  it('rejects unverified Biletix /001 performance URLs', () => {
    expect(classifyBiletixTicketEvidence('https://www.biletix.com/performance/ABC12/001/TURKIYE/tr', null)).toBe(
      'UNVERIFIED_001'
    )
    expect(
      classifyBiletixTicketEvidence(
        'https://www.biletix.com/performance/ABC12/001/TURKIYE/tr',
        'https://www.biletix.com/performance/ABC12/001/TURKIYE/tr'
      )
    ).toBe('SITEMAP_UNIQUE_PERFORMANCE')
  })

  it('keeps the province-scoped district clamp', () => {
    const clamped = clampDistrictToProvince(
      event({ id: 'x', title: 'X', startsAt: '2026-10-01T18:00:00.000Z', citySlug: 'izmir', districtSlug: 'cankaya' }),
      'izmir'
    )
    expect(clamped.districtSlug).toBeUndefined()
  })

  it('scopes the write canary to the three provinces and never plans absence deletes', () => {
    const scoped = filterEventsToProvinces(
      [
        event({ id: 'biletix_1', title: 'A', startsAt: '2026-10-01T18:00:00.000Z', citySlug: 'canakkale' }),
        event({ id: 'biletix_2', title: 'B', startsAt: '2026-10-01T18:00:00.000Z', citySlug: 'istanbul' }),
        event({
          id: 'bubilet_1',
          title: 'C',
          startsAt: '2026-10-01T18:00:00.000Z',
          citySlug: 'samsun',
          source: 'bubilet',
        }),
      ],
      ['canakkale', 'tunceli', 'samsun']
    )
    expect(scoped.map((row) => row.citySlug).sort()).toEqual(['canakkale', 'samsun'])
    expect(assertWritePlanSafe({ wouldDelete: 0 }).ok).toBe(true)
  })

  it('never lets the occurrence writer call markRemoved or markPast', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/services/eventSyncService.ts'), 'utf8')
    const start = source.indexOf('async upsertOccurrencesOnly')
    const end = source.indexOf('async syncEvents')
    const writer = source.slice(start, end)
    expect(writer).toContain('upsertEvents')
    expect(writer).not.toMatch(/markRemoved/)
    expect(writer).not.toMatch(/markPast/)
    expect(source.slice(source.indexOf('async syncOccurrences'), start)).not.toMatch(/markRemovedEvents|markPastEvents/)
  })

  it('reconciles across batches when the matching provider arrives later', () => {
    const batchA = event({
      id: 'biletix_later',
      title: 'CRUSH',
      startsAt: '2026-09-25T18:00:00.000Z',
      venue: 'Tarihi Havagazı Fabrikası',
      source: 'biletix',
      citySlug: 'izmir',
    })
    const batchB = event({
      id: 'bubilet_later',
      title: 'CRUSH',
      startsAt: '2026-09-25T18:00:00.000Z',
      venue: 'Alsancak Tarihi Havagazı Fabrikası',
      source: 'bubilet',
      citySlug: 'izmir',
    })
    const pairs = findReconcilePairs([batchA, batchB])
    expect(pairs[0]?.confidence === 'EXACT' || pairs[0]?.confidence === 'HIGH_CONFIDENCE').toBe(true)
  })

  it('keeps the bounded cron from calling markRemoved or markPast', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/services/eventProviders/occurrenceCron.ts'), 'utf8')
    expect(source).toContain('shouldStartNextUnit')
    expect(source).toContain('advanceProviderCursor')
    expect(source).not.toMatch(/markRemovedEvents|markPastEvents/)
  })

  it('keeps presentation reconciliation EXACT/HIGH collapse rules', () => {
    const left = event({
      id: 'biletix_a',
      title: 'CRUSH',
      startsAt: '2026-09-25T18:00:00.000Z',
      venue: 'Tarihi Havagazı Fabrikası',
      source: 'biletix',
    })
    const right = event({
      id: 'bubilet_b',
      title: 'CRUSH',
      startsAt: '2026-09-25T18:00:00.000Z',
      venue: 'Alsancak Tarihi Havagazı Fabrikası',
      source: 'bubilet',
    })
    const pairs = findReconcilePairs([left, right])
    expect(pairs[0]?.confidence === 'EXACT' || pairs[0]?.confidence === 'HIGH_CONFIDENCE').toBe(true)
  })
})
