import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { distanceKm, formatDistance, isDutyListStale, isOnDutyNow, directionsUrl } from './geo'
import { dedupeCityEvents, eventTitleKey, pickFeaturedEvents } from './eventDedupe'
import { groupDuplicateJobs, jobVacancies, pickFeaturedJobs, countRecentJobs } from './jobGrouping'
import { formatEventDateTime } from '@/lib/eventUtils'
import {
  buildCityEventJsonLd,
  buildDutyPharmacyItemListJsonLd,
  buildJobPostingJsonLd,
  cityServicesSchemaLive,
} from '@/lib/seo/cityServicesJsonLd'
import type { NaEvent } from '@/types/event'
import type { JobListing } from '@/types/jobListing'

const ev = (o: Partial<NaEvent>): NaEvent =>
  ({ id: 'x', title: 'T', description: '', category: 'concert', city: 'Çanakkale', citySlug: 'canakkale',
    venue: 'The Keep', startsAt: '2026-10-20T18:45:00.000Z', createdAt: '', status: 'published', ...o }) as NaEvent

const job = (o: Partial<JobListing>): JobListing =>
  ({ id: 'j', citySlug: 'canakkale', cityName: 'Çanakkale', title: 'Şoför (Yolcu Taşıma)', employer: 'EDA ŞEN',
    employerType: null, district: 'Merkez', locationLabel: null, workType: 'Tam Zamanlı', openPositions: null,
    deadlineAt: null, publishedAt: '2026-10-15T00:00:00Z', applyUrl: null, source: 'iskur', sourceId: 's',
    listingKind: 'normal', isActive: true, fetchedAt: '', syncedAt: '', ...o }) as JobListing

describe('CITY-SERVICES-1 geo', () => {
  it('measures and formats distances', () => {
    const km = distanceKm({ lat: 40.1469, lng: 26.408 }, { lat: 40.0988, lng: 26.4009 })
    expect(km).toBeGreaterThan(5)
    expect(km).toBeLessThan(6)
    expect(formatDistance(0.34)).toBe('350 m')
    expect(formatDistance(1.24)).toBe('1,2 km')
    expect(formatDistance(14.4)).toBe('14 km')
  })
  it('flags an old duty list as stale', () => {
    const now = new Date('2026-10-16T12:00:00+03:00')
    const g = [{ pharmacies: [{ dutyEnd: '2026-10-01T08:30:00+03:00' }] }]
    expect(isDutyListStale({ dutyDate: '2026-09-30', groups: g }, now)).toBe(true)
    const fresh = [{ pharmacies: [{ dutyEnd: '2026-10-17T08:30:00+03:00' }] }]
    expect(isDutyListStale({ dutyDate: '2026-10-16', groups: fresh }, now)).toBe(false)
    expect(isDutyListStale(null, now)).toBe(false)
  })
  it('knows who is on duty now and links directions', () => {
    const p = { dutyStart: '2026-10-16T19:00:00+03:00', dutyEnd: '2026-10-17T08:30:00+03:00' }
    expect(isOnDutyNow(p, new Date('2026-10-16T23:00:00+03:00'))).toBe(true)
    expect(isOnDutyNow(p, new Date('2026-10-17T09:00:00+03:00'))).toBe(false)
    expect(directionsUrl({ lat: 40.1, lng: 26.4 })).toContain('destination=40.1,26.4')
  })
})

describe('CITY-SERVICES-1 events', () => {
  it('merges the same show sold on two ticket sites', () => {
    const a = ev({ id: 'biletix', title: 'Yung Ouzo', endsAt: '2026-10-20T18:45:00.000Z' })
    const b = ev({ id: 'bubilet', title: 'Yung Ouzo Konseri', endsAt: '2026-10-20T20:15:00.000Z', coverImageUrl: 'https://x/y.jpg' })
    const c = ev({ id: 'other', title: 'Nazım', startsAt: '2026-10-22T17:00:00.000Z' })
    const out = dedupeCityEvents([a, b, c])
    expect(out.map((e) => e.id)).toEqual(['bubilet', 'other'])
    expect(eventTitleKey('Devlerin Savaşı')).toBe(eventTitleKey('DEVLERİN SAVAŞI'.toLocaleLowerCase('tr-TR')))
  })
  it('does not print «21:45 – 21:45»', () => {
    const s = formatEventDateTime('2026-10-20T18:45:00.000Z', '2026-10-20T18:45:00.000Z')
    expect(s).not.toContain('–')
  })
  it('features upcoming events with photos', () => {
    const now = new Date('2026-10-16T12:00:00Z')
    const list = [
      ev({ id: 'a', coverImageUrl: 'https://a', startsAt: '2026-10-18T18:00:00Z', ticketUrl: 'https://t' }),
      ev({ id: 'b', startsAt: '2026-10-18T18:00:00Z' }),
      ev({ id: 'c', coverImageUrl: 'https://c', startsAt: '2026-12-18T18:00:00Z' }),
      ev({ id: 'd', coverImageUrl: 'https://d', category: 'cinema', startsAt: '2026-10-17T18:00:00Z' }),
    ]
    expect(pickFeaturedEvents(list, now).map((e) => e.id)).toEqual(['a'])
  })
})

describe('CITY-SERVICES-1 jobs', () => {
  it('turns five identical İŞKUR rows into one «5 kadro» card', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => job({ id: `j${i}` }))
    const g = groupDuplicateJobs([...rows, job({ id: 'k', title: 'Gıda Mühendisi', employer: 'AHDE' })])
    expect(g).toHaveLength(2)
    expect(jobVacancies(g[0]!)).toBe(5)
    expect(g[0]!.mergedIds).toHaveLength(5)
    expect(pickFeaturedJobs(g)[0]!.title).toBe('Şoför (Yolcu Taşıma)')
    expect(countRecentJobs(rows, new Date('2026-10-16T00:00:00Z'))).toBe(5)
  })
})

describe('CITY-SERVICES-1 structured data', () => {
  it('waits for the SEO-1D.1 freeze to end', () => {
    expect(cityServicesSchemaLive(new Date('2026-10-20T12:00:00+03:00'))).toBe(false)
    expect(cityServicesSchemaLive(new Date('2026-10-25T09:00:00+03:00'))).toBe(true)
  })
  it('builds Pharmacy, Event and JobPosting', () => {
    const list = buildDutyPharmacyItemListJsonLd(
      { citySlug: 'canakkale', sourceUrl: '', sourceLabel: '', fetchedAt: '', dutyDate: '2026-10-16', pharmacyCount: 1,
        groups: [{ district: 'Merkez', districtSlug: 'merkez', pharmacies: [{ name: 'AKBAY ECZANESİ', address: 'Demircioğlu Cd. 51', phone: '0286 217 30 38', phoneHref: 'tel:02862173038', dutyLabel: '', dutyStart: null, dutyEnd: null, mapsUrl: null, lat: 40.1, lng: 26.4 }] }] },
      'Çanakkale'
    )
    expect(JSON.stringify(list)).toContain('"Pharmacy"')
    expect(buildCityEventJsonLd(ev({ title: 'Ayna' }))?.['@type']).toBe('Event')
    const jp = { id: 'j', title: 'Şoför', employer: 'EDA ŞEN', place: 'Merkez', cityName: 'Çanakkale',
      datePosted: '2026-10-15T00:00:00Z', validThrough: null, workType: 'Tam Zamanlı' }
    expect(buildJobPostingJsonLd({ ...jp, summary: 'kısa' })).toBeNull()
    const ok = buildJobPostingJsonLd({ ...jp, summary: 'Yolcu taşımacılığı için B/D sınıfı ehliyetli, SRC belgeli, deneyimli şoför aranıyor.' }, new Date('2026-10-16'))
    expect(ok?.employmentType).toBe('FULL_TIME')
  })
  it('scans helper class strings so event pills keep their colours', () => {
    expect(readFileSync('tailwind.config.ts', 'utf8')).toContain("'./src/lib/**/*.{ts,tsx}'")
  })
})
