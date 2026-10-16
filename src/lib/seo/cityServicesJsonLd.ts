/**
 * CITY-SERVICES-1 / Faz 4 — structured data for the city service pages:
 *   nöbetçi eczane list → ItemList of Pharmacy, etkinlik detail → Event,
 *   iş ilanı detail → JobPosting (only when the listing has a real description).
 *
 * SEO-1D.1 freeze: city pages must not change before 24 Oct 2026, so nothing is
 * emitted before CITY_SERVICES_SCHEMA_FROM; it switches itself on afterwards.
 */
import type { DutyPharmacySnapshot } from '@/types/dutyPharmacy'
import type { NaEvent } from '@/types/event'

export const CITY_SERVICES_SCHEMA_FROM = '2026-10-25T00:00:00+03:00'

export function cityServicesSchemaLive(now: Date = new Date()): boolean {
  if (process.env.CITY_SERVICES_SCHEMA === 'off') return false
  if (process.env.CITY_SERVICES_SCHEMA === 'on') return true
  return now.getTime() >= Date.parse(CITY_SERVICES_SCHEMA_FROM)
}

/** Safe for <script type="application/ld+json">. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

export function buildDutyPharmacyItemListJsonLd(
  snapshot: DutyPharmacySnapshot,
  cityName: string
): Record<string, unknown> | null {
  const rows = snapshot.groups.flatMap((g) => g.pharmacies.map((p) => ({ p, district: g.district })))
  if (rows.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${cityName} nöbetçi eczaneler`,
    numberOfItems: rows.length,
    itemListElement: rows.map(({ p, district }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Pharmacy',
        name: clean(p.name),
        ...(p.phone ? { telephone: clean(p.phone) } : {}),
        address: {
          '@type': 'PostalAddress',
          ...(p.address ? { streetAddress: clean(p.address) } : {}),
          addressLocality: district,
          addressRegion: cityName,
          addressCountry: 'TR',
        },
        ...(typeof p.lat === 'number' && typeof p.lng === 'number'
          ? { geo: { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng } }
          : {}),
        ...(p.mapsUrl ? { hasMap: p.mapsUrl } : {}),
      },
    })),
  }
}

export function buildCityEventJsonLd(event: NaEvent): Record<string, unknown> | null {
  const start = Date.parse(event.startsAt)
  if (!event.title || !Number.isFinite(start) || !event.venue) return null
  const end = event.endsAt ? Date.parse(event.endsAt) : NaN
  const image = event.coverImageUrl?.startsWith('https://') ? [event.coverImageUrl] : undefined
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: clean(event.title),
    startDate: new Date(start).toISOString(),
    ...(Number.isFinite(end) && end > start ? { endDate: new Date(end).toISOString() } : {}),
    eventStatus:
      event.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: clean(event.venue),
      address: {
        '@type': 'PostalAddress',
        ...(event.address ? { streetAddress: clean(event.address) } : {}),
        addressLocality: event.city,
        addressRegion: event.city,
        addressCountry: 'TR',
      },
      ...(typeof event.lat === 'number' && typeof event.lng === 'number'
        ? { geo: { '@type': 'GeoCoordinates', latitude: event.lat, longitude: event.lng } }
        : {}),
    },
    ...(image ? { image } : {}),
    ...(event.description ? { description: clean(event.description).slice(0, 500) } : {}),
    ...(event.organizer ? { organizer: { '@type': 'Organization', name: clean(event.organizer) } } : {}),
    ...(event.isFree ? { isAccessibleForFree: true } : {}),
    ...(event.ticketUrl
      ? { offers: { '@type': 'Offer', url: event.ticketUrl, availability: 'https://schema.org/InStock' } }
      : {}),
  }
}

export type JobPostingInput = {
  id: string
  title: string
  employer: string | null
  summary: string | null
  place: string | null
  cityName: string
  datePosted: string | null
  validThrough: string | null
  workType: string | null
}

function employmentType(workType: string | null): string | undefined {
  const w = (workType ?? '').toLocaleLowerCase('tr-TR')
  if (!w) return undefined
  if (w.includes('yarı') || w.includes('part')) return 'PART_TIME'
  if (w.includes('staj')) return 'INTERN'
  if (w.includes('geçici') || w.includes('sözleşmeli') || w.includes('dönemsel')) return 'TEMPORARY'
  if (w.includes('tam')) return 'FULL_TIME'
  return undefined
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Google requires title, description, datePosted, hiringOrganization and jobLocation.
 * Rows without a real description, date or employer, or already expired, get none.
 */
export function buildJobPostingJsonLd(job: JobPostingInput, now: Date = new Date()): Record<string, unknown> | null {
  const summary = clean(job.summary)
  if (!job.title || !job.employer || !job.datePosted || summary.length < 60) return null
  const posted = Date.parse(job.datePosted)
  if (!Number.isFinite(posted)) return null
  const until = job.validThrough ? Date.parse(job.validThrough) : NaN
  if (Number.isFinite(until) && until < now.getTime()) return null
  const type = employmentType(job.workType)
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: clean(job.title),
    description: `<p>${escapeHtml(summary)}</p>`,
    datePosted: new Date(posted).toISOString(),
    ...(Number.isFinite(until) ? { validThrough: new Date(until).toISOString() } : {}),
    ...(type ? { employmentType: type } : {}),
    hiringOrganization: { '@type': 'Organization', name: clean(job.employer) },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.place || job.cityName,
        addressRegion: job.cityName,
        addressCountry: 'TR',
      },
    },
    identifier: { '@type': 'PropertyValue', name: 'NaHaber', value: job.id },
    directApply: false,
  }
}
