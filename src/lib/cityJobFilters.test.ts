import { describe, expect, it } from 'vitest'
import {
  CITYWIDE_DISTRICT_SLUG,
  filterCityJobs,
  resolveJobCategory,
  resolveJobDistrictSlug,
  sortCityJobs,
  type CityJobFilterState,
} from '@/lib/cityJobFilters'
import type { JobListing } from '@/types/jobListing'

const DISTRICTS = [
  { slug: 'ayvacik', name: 'Ayvacık' },
  { slug: 'biga', name: 'Biga' },
  { slug: 'can', name: 'Çan' },
  { slug: 'merkez', name: 'Merkez' },
]

function makeJob(overrides: Partial<JobListing> = {}): JobListing {
  return {
    id: 'j1',
    citySlug: 'canakkale',
    cityName: 'Çanakkale',
    title: 'Satış Elemanı',
    employer: 'Test A.Ş.',
    employerType: 'Özel',
    district: null,
    locationLabel: null,
    workType: 'Tam Zamanlı',
    openPositions: 1,
    deadlineAt: '2026-08-31T00:00:00.000Z',
    publishedAt: null,
    applyUrl: 'https://example.com',
    source: 'iskur',
    sourceId: '1',
    listingKind: 'normal',
    isActive: true,
    fetchedAt: '2026-08-14T10:00:00.000Z',
    syncedAt: '2026-08-14T10:00:00.000Z',
    ...overrides,
  }
}

describe('resolveJobCategory', () => {
  it('maps sales titles', () => {
    expect(resolveJobCategory(makeJob({ title: 'Özel Satış Elemanı / Danışmanı' }))).toBe(
      'sales'
    )
  })

  it('maps driver titles', () => {
    expect(resolveJobCategory(makeJob({ title: 'Kamyon Şoförü' }))).toBe('driver')
  })

  it('falls back to other', () => {
    expect(resolveJobCategory(makeJob({ title: 'Uzman Koordinatör' }))).toBe('other')
  })
})

describe('resolveJobDistrictSlug', () => {
  it('detects Biga from İŞKUR location label', () => {
    const slug = resolveJobDistrictSlug(
      makeJob({
        locationLabel: 'İlçe Geneli Başvuru (Çalışma Yeri: ÇANAKKALE / BİGA)',
      }),
      DISTRICTS
    )
    expect(slug).toBe('biga')
  })

  it('detects İl Merkezi without matching Çan inside Çanakkale', () => {
    const slug = resolveJobDistrictSlug(
      makeJob({
        locationLabel: 'İlçe Geneli Başvuru (Çalışma Yeri: ÇANAKKALE / ÇANAKKALE MERKEZ)',
      }),
      DISTRICTS
    )
    expect(slug).toBe('merkez')
  })

  it('detects Çan as its own district', () => {
    const slug = resolveJobDistrictSlug(
      makeJob({
        locationLabel: 'Ülke Geneli Başvuru (Çalışma Yeri: ÇANAKKALE / ÇAN)',
      }),
      DISTRICTS
    )
    expect(slug).toBe('can')
  })

  it('returns null when only province name is present', () => {
    const slug = resolveJobDistrictSlug(
      makeJob({ locationLabel: 'Çanakkale', district: null }),
      DISTRICTS
    )
    expect(slug).toBeNull()
  })
})

describe('filterCityJobs', () => {
  const jobs = [
    makeJob({
      id: '1',
      title: 'Satış Elemanı',
      locationLabel: 'ÇANAKKALE / BİGA',
      source: 'iskur',
    }),
    makeJob({
      id: '2',
      title: 'Yazılım Geliştirici',
      locationLabel: 'Çanakkale',
      source: 'kariyer',
      workType: 'Hibrit',
    }),
    makeJob({
      id: '3',
      title: 'Kamyon Şoförü',
      locationLabel: 'ÇANAKKALE / ÇANAKKALE MERKEZ',
      source: 'iskur',
    }),
  ]

  it('filters by category', () => {
    const filters: CityJobFilterState = {
      query: '',
      category: 'sales',
      districtSlug: null,
      source: null,
      workType: null,
    }
    expect(filterCityJobs(jobs, filters, DISTRICTS).map((j) => j.id)).toEqual(['1'])
  })

  it('filters by İl Merkezi', () => {
    const filters: CityJobFilterState = {
      query: '',
      category: null,
      districtSlug: 'merkez',
      source: null,
      workType: null,
    }
    expect(filterCityJobs(jobs, filters, DISTRICTS).map((j) => j.id)).toEqual(['3'])
  })

  it('filters citywide / unspecified', () => {
    const filters: CityJobFilterState = {
      query: '',
      category: null,
      districtSlug: CITYWIDE_DISTRICT_SLUG,
      source: null,
      workType: null,
    }
    expect(filterCityJobs(jobs, filters, DISTRICTS).map((j) => j.id)).toEqual(['2'])
  })
})

describe('sortCityJobs', () => {
  it('sorts by deadline ascending', () => {
    const jobs = [
      makeJob({ id: 'late', deadlineAt: '2026-09-10T00:00:00.000Z' }),
      makeJob({ id: 'soon', deadlineAt: '2026-08-20T00:00:00.000Z' }),
      makeJob({ id: 'none', deadlineAt: null }),
    ]
    expect(sortCityJobs(jobs, 'deadline').map((j) => j.id)).toEqual(['soon', 'late', 'none'])
  })
})
