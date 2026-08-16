import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { slugifyCity } from '@/lib/location'
import type { DutyPharmacy, DutyPharmacyGroup } from '@/types/dutyPharmacy'

const DUTY_WINDOW_RE =
  /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/
const MAPS_COORD_RE = /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i

export function formatDistrictLabel(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .split('/')
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) =>
          word
            ? word.charAt(0).toLocaleUpperCase('tr-TR') +
              word.slice(1).toLocaleLowerCase('tr-TR')
            : ''
        )
        .join(' ')
    )
    .filter(Boolean)
    .join(' / ')
}

export function cleanPharmacyName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+ECZANESİ\s+ECZANESİ$/i, ' ECZANESİ')
}

function istanbulIso(
  day: string,
  month: string,
  year: string,
  hour: string,
  minute: string
): string {
  return `${year}-${month}-${day}T${hour}:${minute}:00+03:00`
}

export function parseDutyWindow(label: string): {
  dutyStart: string | null
  dutyEnd: string | null
} {
  const match = label.match(DUTY_WINDOW_RE)
  if (!match) return { dutyStart: null, dutyEnd: null }
  return {
    dutyStart: istanbulIso(match[1], match[2], match[3], match[4], match[5]),
    dutyEnd: istanbulIso(match[6], match[7], match[8], match[9], match[10]),
  }
}

function parseMaps(href: string | undefined): {
  mapsUrl: string | null
  lat: number | null
  lng: number | null
} {
  if (!href) return { mapsUrl: null, lat: null, lng: null }
  const match = href.match(MAPS_COORD_RE)
  if (!match) return { mapsUrl: href, lat: null, lng: null }
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { mapsUrl: href, lat: null, lng: null }
  }
  return { mapsUrl: href, lat, lng }
}

function extractAddress($card: cheerio.Cheerio<AnyNode>): string {
  const html = $card.find('p').first().html() ?? ''
  const afterHome = html.split(/fa-home[^>]*>/i)[1]
  if (!afterHome) return ''
  const beforeBreak = afterHome.split(/<br\b/i)[0] ?? ''
  return cheerio
    .load(`<span>${beforeBreak}</span>`)('span')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCard($card: cheerio.Cheerio<AnyNode>): DutyPharmacy | null {
  const name = cleanPharmacyName($card.find('h4 strong').first().text())
  if (!name) return null

  const phoneAnchor = $card.find('a[href^="tel:"]').first()
  const phone = phoneAnchor.text().replace(/\s+/g, '').trim()
  const phoneHref = (phoneAnchor.attr('href') ?? (phone ? `tel:${phone}` : '')).trim()
  const dutyLabel = $card.find('strong.tred').last().text().replace(/\s+/g, ' ').trim()
  const { dutyStart, dutyEnd } = parseDutyWindow(dutyLabel)
  const mapsHref = $card.find('a[href*="maps.google"]').first().attr('href')
  const maps = parseMaps(mapsHref)

  return {
    name,
    address: extractAddress($card),
    phone,
    phoneHref,
    dutyLabel,
    dutyStart,
    dutyEnd,
    mapsUrl: maps.mapsUrl,
    lat: maps.lat,
    lng: maps.lng,
  }
}

function districtFromHeading(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!/NÖBETÇİ ECZANELER/i.test(cleaned)) return null
  const district = cleaned.replace(/NÖBETÇİ ECZANELER/i, '').trim()
  if (!district || /^bugün$/i.test(district)) return null
  return district
}

/** Parse Çanakkale Eczacı Odası `/nobetci-eczaneler` HTML into district groups. */
export function parseCanakkaleEoHtml(html: string): DutyPharmacyGroup[] {
  const $ = cheerio.load(html)
  const groups: DutyPharmacyGroup[] = []
  let current: DutyPharmacyGroup | null = null

  $('h3.main-color, div.nobetci').each((_, el) => {
    const $el = $(el)
    if ($el.is('h3')) {
      const districtRaw = districtFromHeading($el.text())
      if (!districtRaw) return
      const district = formatDistrictLabel(districtRaw)
      current = {
        district,
        districtSlug: slugifyCity(districtRaw),
        pharmacies: [],
      }
      groups.push(current)
      return
    }

    if (!current || !$el.hasClass('nobetci')) return
    const pharmacy = parseCard($el)
    if (pharmacy) current.pharmacies.push(pharmacy)
  })

  return groups.filter((group) => group.pharmacies.length > 0)
}

export function dutyDateFromGroups(groups: DutyPharmacyGroup[]): string | null {
  for (const group of groups) {
    for (const pharmacy of group.pharmacies) {
      if (pharmacy.dutyStart) return pharmacy.dutyStart.slice(0, 10)
    }
  }
  return null
}

export function countPharmacies(groups: DutyPharmacyGroup[]): number {
  return groups.reduce((sum, group) => sum + group.pharmacies.length, 0)
}
