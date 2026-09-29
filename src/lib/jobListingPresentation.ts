import type { JobClassified } from '@/types/jobClassified'
import type { JobListing, JobListingSource } from '@/types/jobListing'
import { jobCategoryLabel, resolveJobCategory, resolveJobDistrictSlug } from '@/lib/cityJobFilters'

export function formatJobDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function jobSourceLabel(source: JobListingSource): string {
  if (source === 'kariyer') return 'Kariyer.net'
  if (source === 'iskur') return 'İŞKUR'
  return 'NaHaber'
}

export function jobKindLabel(kind: JobListing['listingKind']): string | null {
  if (kind === 'iup') return 'IUP'
  if (kind === 'typ') return 'TYP'
  return null
}

export function jobMonogram(title: string, employer: string | null): string {
  const source = (employer || title).trim()
  const parts = source.split(/\s+/).filter((part) => /[A-Za-zÀ-ÿĞğÜüŞşİıÖöÇç]/.test(part))
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? ''
  const mark = `${first}${second}`.toLocaleUpperCase('tr-TR')
  return mark || 'İŞ'
}

export function jobDistrictName(
  job: Pick<JobListing, 'district' | 'locationLabel'>,
  provinceDistricts: Array<{ slug: string; name: string }>
): string | null {
  const slug = resolveJobDistrictSlug(job as JobListing, provinceDistricts)
  if (slug === 'merkez') return 'İl Merkezi'
  if (slug) return provinceDistricts.find((d) => d.slug === slug)?.name ?? slug
  return job.locationLabel || job.district || null
}

export interface JobDetailFact {
  label: string
  value: string
}

export interface JobDetailRelated {
  id: string
  title: string
  employer: string | null
  place: string | null
  sourceLabel: string
}

export interface JobDetailContent {
  id: string
  cityName: string
  title: string
  employer: string | null
  monogram: string
  sourceLabel: string
  categoryLabel: string
  kindLabel: string | null
  place: string | null
  summary: string | null
  requirements: string | null
  salaryText: string | null
  facts: JobDetailFact[]
  applyUrl: string | null
  applyHint: string
  related: JobDetailRelated[]
}

function factsFrom(pairs: Array<[string, string | null | undefined]>): JobDetailFact[] {
  return pairs
    .filter((pair): pair is [string, string] => Boolean(pair[1]?.trim()))
    .map(([label, value]) => ({ label, value }))
}

export function buildListingDetail(
  job: JobListing,
  provinceDistricts: Array<{ slug: string; name: string }>,
  relatedJobs: JobListing[]
): JobDetailContent {
  const place = jobDistrictName(job, provinceDistricts)
  const sourceLabel = jobSourceLabel(job.source)
  return {
    id: job.id,
    cityName: job.cityName,
    title: job.title,
    employer: job.employer,
    monogram: jobMonogram(job.title, job.employer),
    sourceLabel,
    categoryLabel: jobCategoryLabel(resolveJobCategory(job)),
    kindLabel: jobKindLabel(job.listingKind),
    place,
    summary: job.summary?.trim() || null,
    requirements: null,
    salaryText: null,
    facts: factsFrom([
      ['Konum', place || job.locationLabel],
      ['Çalışma şekli', job.workType],
      [
        'Kontenjan',
        job.openPositions != null && job.openPositions > 0
          ? `${job.openPositions} kişi`
          : null,
      ],
      ['Son başvuru', formatJobDate(job.deadlineAt)],
      ['Yayın', formatJobDate(job.publishedAt)],
      ['İşveren türü', job.employerType],
      ['Kaynak', sourceLabel],
    ]),
    applyUrl: job.applyUrl,
    applyHint:
      job.source === 'kariyer'
        ? 'Başvuru Kariyer.net üzerinde tamamlanır. NaHaber başvuru almaz.'
        : 'Başvuru İŞKUR üzerinde tamamlanır. NaHaber başvuru almaz.',
    related: relatedJobs.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      employer: item.employer,
      place: jobDistrictName(item, provinceDistricts),
      sourceLabel: jobSourceLabel(item.source),
    })),
  }
}

export function buildClassifiedDetail(classified: JobClassified): JobDetailContent {
  const applyUrl = classified.website?.startsWith('http')
    ? classified.website
    : classified.contactEmail
      ? `mailto:${classified.contactEmail}`
      : classified.contactPhone
        ? `tel:${classified.contactPhone.replace(/\s/g, '')}`
        : null

  return {
    id: `classified_${classified.id}`,
    cityName: classified.cityName,
    title: classified.title,
    employer: classified.companyName,
    monogram: jobMonogram(classified.title, classified.companyName),
    sourceLabel: 'NaHaber',
    categoryLabel: jobCategoryLabel(classified.category),
    kindLabel: null,
    place: classified.districtLabel,
    summary: classified.description?.trim() || null,
    requirements: classified.requirements?.trim() || null,
    salaryText:
      classified.hideSalary || !classified.salaryText?.trim()
        ? null
        : classified.salaryText.trim(),
    facts: factsFrom([
      ['Konum', classified.locationNote
        ? `${classified.districtLabel} · ${classified.locationNote}`
        : classified.districtLabel],
      ['Çalışma şekli', classified.workType],
      [
        'Kontenjan',
        classified.openPositions != null && classified.openPositions > 0
          ? `${classified.openPositions} kişi`
          : null,
      ],
      ['Son başvuru', formatJobDate(classified.deadlineAt)],
      ['İşveren türü', classified.employerType],
      ['İletişim', classified.contactName],
      ['Kaynak', 'NaHaber'],
    ]),
    applyUrl,
    applyHint: 'Bu ilan NaHaber üzerinden bırakıldı. Başvuru, ilan sahibinin iletişim kanalına gider.',
    related: [],
  }
}
