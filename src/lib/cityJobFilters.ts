import { extractDistrictSlugFromText } from '@/constants/cities'
import type { JobListing, JobListingSource } from '@/types/jobListing'

export type JobCategoryId =
  | 'sales'
  | 'driver'
  | 'production'
  | 'construction'
  | 'hospitality'
  | 'office'
  | 'health'
  | 'education'
  | 'security'
  | 'it'
  | 'service'
  | 'other'

export type CityJobSort = 'deadline' | 'newest' | 'title'

export interface CityJobFilterState {
  query: string
  category: JobCategoryId | null
  /** Canonical district slug, or `__citywide__` for unspecified / province-wide. */
  districtSlug: string | null
  source: JobListingSource | null
  workType: string | null
}

export const CITYWIDE_DISTRICT_SLUG = '__citywide__'

export const DEFAULT_CITY_JOB_FILTERS: CityJobFilterState = {
  query: '',
  category: null,
  districtSlug: null,
  source: null,
  workType: null,
}

export const JOB_CATEGORIES: Array<{ id: JobCategoryId; label: string; patterns: RegExp[] }> = [
  {
    id: 'sales',
    label: 'Satış & Pazarlama',
    patterns: [
      /satis/,
      /pazarlama/,
      /danisman/,
      /perakende/,
      /tezgah(tar)?/,
      /musteri\s*temsil/,
    ],
  },
  {
    id: 'driver',
    label: 'Şoför & Lojistik',
    patterns: [
      /sofor/,
      /kamyon/,
      /forklift/,
      /lojistik/,
      /nakliye/,
      /dagitim/,
      /yolcu\s*tasima/,
    ],
  },
  {
    id: 'production',
    label: 'Üretim & Fabrika',
    patterns: [
      /uretim/,
      /fabrika/,
      /operator/,
      /kaynakci/,
      /makine/,
      /imalat/,
      /seramik/,
      /beden\s*isci/,
    ],
  },
  {
    id: 'construction',
    label: 'İnşaat',
    patterns: [/insaat/, /usta/, /elektrikci/, /sihhi\s*tesisat/, /boyaci/, /kalipci/],
  },
  {
    id: 'hospitality',
    label: 'Turizm & Yiyecek',
    patterns: [
      /garson/,
      /asci/,
      /mutfak/,
      /barista/,
      /otel/,
      /turizm/,
      /tur\s*operat/,
      /kahve/,
      /restoran/,
    ],
  },
  {
    id: 'office',
    label: 'Ofis & Muhasebe',
    patterns: [
      /muhasebe/,
      /on\s*muhasebe/,
      /sekreter/,
      /idari/,
      /ofis/,
      /insan\s*kaynak/,
    ],
  },
  {
    id: 'health',
    label: 'Sağlık',
    patterns: [
      /hemsire/,
      /doktor/,
      /saglik/,
      /eczane/,
      /laboratu(v|a)ar/,
      /tekniker/,
      /bakim/,
    ],
  },
  {
    id: 'education',
    label: 'Eğitim',
    patterns: [/ogretmen/, /mudur/, /anaokul/, /egitim/, /ogretim/],
  },
  {
    id: 'security',
    label: 'Güvenlik',
    patterns: [/guvenlik/, /bekci/, /kapici/, /kaloriferci/],
  },
  {
    id: 'it',
    label: 'Bilişim',
    patterns: [
      /yazilim/,
      /bilisim/,
      /yazilimci/,
      /developer/,
      /bilgisayar/,
      /teknisyen/,
    ],
  },
  {
    id: 'service',
    label: 'Hizmet & Temizlik',
    patterns: [/temizlik/, /hizmet/, /personel/, /yardimci/],
  },
  {
    id: 'other',
    label: 'Diğer',
    patterns: [],
  },
]

function normalizeTr(text: string): string {
  return text.toLocaleLowerCase('tr-TR')
}

function normalizeTrAscii(text: string): string {
  return normalizeTr(text)
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

/** Word-boundary match so "çan" does not hit inside "çanakkale". */
function textHasDistrictToken(hayAscii: string, token: string): boolean {
  const t = normalizeTrAscii(token)
  if (t.length < 2) return false
  const re = new RegExp(`(?<![a-z0-9])${t.replace(/\s+/g, '\\s*')}(?![a-z0-9])`)
  return re.test(hayAscii)
}

export function resolveJobCategory(job: JobListing): JobCategoryId {
  const hay = normalizeTrAscii(
    [job.title, job.employer, job.workType].filter(Boolean).join(' ')
  )
  for (const cat of JOB_CATEGORIES) {
    if (cat.id === 'other') continue
    if (cat.patterns.some((re) => re.test(hay))) return cat.id
  }
  return 'other'
}

export function jobCategoryLabel(id: JobCategoryId): string {
  return JOB_CATEGORIES.find((c) => c.id === id)?.label ?? 'Diğer'
}

/**
 * Resolve a job to a province district slug.
 * Prefers `district` + `locationLabel` (e.g. "ÇANAKKALE / BİGA", "… MERKEZ").
 */
export function resolveJobDistrictSlug(
  job: JobListing,
  provinceDistricts: Array<{ slug: string; name: string }>
): string | null {
  const hay = [job.district, job.locationLabel].filter(Boolean).join(' ').trim()
  if (!hay) return null

  const hayAscii = normalizeTrAscii(hay)

  // Explicit merkez markers before generic extract (province “Merkez” ilçesi).
  if (
    textHasDistrictToken(hayAscii, 'merkez') ||
    /(?<![a-z0-9])il\s*merkezi(?![a-z0-9])/.test(hayAscii)
  ) {
    const merkez = provinceDistricts.find((d) => d.slug === 'merkez')
    if (merkez) return 'merkez'
  }

  // Match against this province’s districts (longest name first).
  const sorted = [...provinceDistricts].sort(
    (a, b) => b.name.length - a.name.length || b.slug.length - a.slug.length
  )
  for (const d of sorted) {
    if (d.slug === 'merkez') continue
    if (textHasDistrictToken(hayAscii, d.name) || textHasDistrictToken(hayAscii, d.slug)) {
      return d.slug
    }
  }

  // Fallback: national dictionary (still useful for odd labels).
  const fromText = extractDistrictSlugFromText(hay)
  if (fromText && provinceDistricts.some((d) => d.slug === fromText)) {
    return fromText
  }

  return null
}

export function extractJobCategoryOptions(
  jobs: JobListing[]
): Array<{ id: JobCategoryId; label: string; count: number }> {
  const counts = new Map<JobCategoryId, number>()
  for (const job of jobs) {
    const id = resolveJobCategory(job)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return JOB_CATEGORIES.filter((c) => (counts.get(c.id) ?? 0) > 0).map((c) => ({
    id: c.id,
    label: c.label,
    count: counts.get(c.id) ?? 0,
  }))
}

export function extractJobDistrictOptions(
  jobs: JobListing[],
  provinceDistricts: Array<{ slug: string; name: string }>
): Array<{ slug: string; name: string; count: number }> {
  const counts = new Map<string, number>()
  let citywide = 0

  for (const job of jobs) {
    const slug = resolveJobDistrictSlug(job, provinceDistricts)
    if (!slug) {
      citywide += 1
      continue
    }
    counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }

  const options: Array<{ slug: string; name: string; count: number }> = []

  // İl merkezi first when present in province list.
  const merkez = provinceDistricts.find((d) => d.slug === 'merkez')
  if (merkez) {
    options.push({
      slug: 'merkez',
      name: 'İl Merkezi',
      count: counts.get('merkez') ?? 0,
    })
  }

  for (const d of provinceDistricts) {
    if (d.slug === 'merkez') continue
    options.push({
      slug: d.slug,
      name: d.name,
      count: counts.get(d.slug) ?? 0,
    })
  }

  if (citywide > 0) {
    options.push({
      slug: CITYWIDE_DISTRICT_SLUG,
      name: 'İl geneli / belirtilmemiş',
      count: citywide,
    })
  }

  return options
}

export function extractJobWorkTypeOptions(jobs: JobListing[]): string[] {
  const set = new Set<string>()
  for (const job of jobs) {
    const wt = job.workType?.trim()
    if (wt) set.add(wt)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'tr'))
}

export function extractJobSourceOptions(
  jobs: JobListing[]
): Array<{ id: JobListingSource; label: string; count: number }> {
  const labels: Record<JobListingSource, string> = {
    iskur: 'İŞKUR',
    kariyer: 'Kariyer.net',
    manual: 'NaHaber',
  }
  const counts = new Map<JobListingSource, number>()
  for (const job of jobs) {
    counts.set(job.source, (counts.get(job.source) ?? 0) + 1)
  }
  return (['iskur', 'kariyer', 'manual'] as JobListingSource[])
    .filter((id) => (counts.get(id) ?? 0) > 0)
    .map((id) => ({ id, label: labels[id], count: counts.get(id) ?? 0 }))
}

export function countActiveJobFilters(filters: CityJobFilterState): number {
  let n = 0
  if (filters.query.trim()) n += 1
  if (filters.category) n += 1
  if (filters.districtSlug) n += 1
  if (filters.source) n += 1
  if (filters.workType) n += 1
  return n
}

export function filterCityJobs(
  jobs: JobListing[],
  filters: CityJobFilterState,
  provinceDistricts: Array<{ slug: string; name: string }>
): JobListing[] {
  const q = filters.query.trim().toLocaleLowerCase('tr-TR')

  return jobs.filter((job) => {
    if (filters.source && job.source !== filters.source) return false
    if (filters.workType && job.workType !== filters.workType) return false
    if (filters.category && resolveJobCategory(job) !== filters.category) return false

    if (filters.districtSlug) {
      const slug = resolveJobDistrictSlug(job, provinceDistricts)
      if (filters.districtSlug === CITYWIDE_DISTRICT_SLUG) {
        if (slug) return false
      } else if (slug !== filters.districtSlug) {
        return false
      }
    }

    if (!q) return true
    const hay = [job.title, job.employer, job.locationLabel, job.district, job.workType]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('tr-TR')
    return hay.includes(q)
  })
}

export function sortCityJobs(jobs: JobListing[], sort: CityJobSort): JobListing[] {
  const copy = [...jobs]
  if (sort === 'title') {
    copy.sort((a, b) => a.title.localeCompare(b.title, 'tr'))
    return copy
  }
  if (sort === 'newest') {
    copy.sort((a, b) => (b.fetchedAt || '').localeCompare(a.fetchedAt || ''))
    return copy
  }
  // deadline: sooner first; missing deadlines last; then newest
  copy.sort((a, b) => {
    const ad = a.deadlineAt
    const bd = b.deadlineAt
    if (ad && bd) {
      const cmp = ad.localeCompare(bd)
      if (cmp !== 0) return cmp
    } else if (ad && !bd) return -1
    else if (!ad && bd) return 1
    return (b.fetchedAt || '').localeCompare(a.fetchedAt || '')
  })
  return copy
}
