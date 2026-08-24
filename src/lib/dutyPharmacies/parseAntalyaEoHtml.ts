import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { slugifyCity } from '@/lib/location'
import type { DutyPharmacy, DutyPharmacyGroup } from '@/types/dutyPharmacy'
import {
  cleanPharmacyName,
  formatDistrictLabel,
} from '@/lib/dutyPharmacies/parseCanakkaleEoHtml'

const MAPS_COORD_RE = /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i
const NIGHT_NOTE_RE =
  /\*?\*?\(?\s*GECE\s+SAAT\s+[^)]+A\s+KADAR\s+AÇIK\s*\)?\*?\*?/gi

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

function normalizePhone(raw: string): string {
  return raw.replace(/\s+/g, '').trim()
}

function extractNightNote(addressRaw: string): {
  address: string
  dutyLabel: string
} {
  const notes: string[] = []
  const address = addressRaw
    .replace(NIGHT_NOTE_RE, (match) => {
      notes.push(match.replace(/\*+/g, '').replace(/\s+/g, ' ').trim())
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return {
    address,
    dutyLabel: notes.join(' ').trim(),
  }
}

function parseCard($card: cheerio.Cheerio<AnyNode>): DutyPharmacy | null {
  const telLinks = $card.find('a[href^="tel:"]')
  const name = cleanPharmacyName(telLinks.first().text())
  if (!name) return null

  const phoneDisplay = telLinks.eq(1).text().replace(/\s+/g, ' ').trim()
  const phoneHrefRaw = (telLinks.first().attr('href') ?? '').trim()
  const phoneFromHref = phoneHrefRaw.replace(/^tel:/i, '').trim()
  const phone = normalizePhone(phoneDisplay || phoneFromHref)
  const phoneHref =
    phone && phoneHrefRaw && phoneHrefRaw.toLowerCase() !== 'tel:'
      ? phoneHrefRaw
      : phone
        ? `tel:${phone}`
        : ''

  const mapsAnchor = $card.find('a.nadres').first()
  const maps = parseMaps(mapsAnchor.attr('href'))
  const addressRaw = mapsAnchor
    .text()
    .replace(/\s+/g, ' ')
    .trim()
  const { address, dutyLabel } = extractNightNote(addressRaw)

  return {
    name,
    address,
    phone,
    phoneHref,
    dutyLabel,
    dutyStart: null,
    dutyEnd: null,
    mapsUrl: maps.mapsUrl,
    lat: maps.lat,
    lng: maps.lng,
  }
}

/** Parse Antalya Eczacı Odası `/tr/nobetci-eczaneler` HTML into district groups. */
export function parseAntalyaEoHtml(html: string): DutyPharmacyGroup[] {
  const $ = cheerio.load(html)
  const groups: DutyPharmacyGroup[] = []

  $('.nobetciler .ilce').each((_, el) => {
    const $ilce = $(el)
    const districtRaw = $ilce.find('.ilcebas span').first().text().replace(/\s+/g, ' ').trim()
    if (!districtRaw) return

    const district = formatDistrictLabel(districtRaw)
    const pharmacies: DutyPharmacy[] = []
    $ilce.find('.nobetciDiv').each((__, card) => {
      const pharmacy = parseCard($(card))
      if (pharmacy) pharmacies.push(pharmacy)
    })

    if (pharmacies.length === 0) return
    groups.push({
      district,
      districtSlug: slugifyCity(districtRaw),
      pharmacies,
    })
  })

  return groups
}
