import type { EventProvider, EventProviderParams, ProviderFetchResult } from './types'
import {
  fetchDocument,
  findEventNode,
  isDisabledByEnv,
  loadHtml,
  mapWithConcurrency,
  normalizeEvent,
  readEnv,
  stripHtml,
} from './shared'
import { extractDistrictSlugFromText, getCityCategoryName } from '@/constants/cities'
import { getProvincePlate } from '@/constants/provincePlates'
import { createDiagnostics, finalizeDiagnostics } from './diagnostics'
import { looksLikeChallengePage, looksLikeRateLimit, parseTurkishDateTime } from './occurrence'
import { isEventSpecificTicketUrl } from './ticketUrl'
import { slugifyCity } from '@/lib/location'
import type { NaEvent } from '@/types/event'

/**
 * BiletimGO — new EventProvider adapter.
 *
 * Biletino != BiletimGO. This adapter never calls /api/ (robots Disallow).
 * Public HTML only: city calendar + /etkinlik/{slug}-{id}.
 * Disabled until BILETIMGO_ENABLED=true (cron door stays closed).
 */

const DEFAULT_BASE_URL = 'https://www.biletimgo.com'
const DETAIL_CONCURRENCY = 3
const DEFAULT_MAX_DETAILS = 12

export interface BiletimgoListingCard {
  slug: string
  numericId: string
  href: string
  title?: string
  venue?: string
  day?: string
  month?: string
  year?: string
  imageUrl?: string
}

const EVENT_HREF_RE = /etkinlik\/([a-z0-9-]+)-(\d+)(?:\?|$)/i

export function parseBiletimgoEventHref(href: string): { slug: string; numericId: string } | null {
  const match = href.match(EVENT_HREF_RE)
  if (!match) return null
  return { slug: match[1], numericId: match[2] }
}

export function collectBiletimgoListingCards(html: string, baseUrl = DEFAULT_BASE_URL): BiletimgoListingCard[] {
  const $ = loadHtml(html)
  const cards: BiletimgoListingCard[] = []
  const seen = new Set<string>()

  $('a[href*="etkinlik/"]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim()
    const parsed = parseBiletimgoEventHref(href)
    if (!parsed || seen.has(parsed.numericId)) return
    if (/etkinlik-ara|etkinlik-takvimi|etkinlik-arsivi|sehir-etkinlikleri/i.test(href)) return
    seen.add(parsed.numericId)

    const slide = $(el).closest('.swiper-slide')
    const title = slide.find('.swiper-etkinlik-kutu').clone().children().remove().end().text().trim()
    const venue = slide.find('.swiper-etkinlik-platform').text().trim()
    const day = slide.find('.swiper-tarih-gun').text().trim()
    const month = slide.find('.swiper-tarih-ay').text().trim()
    const year = slide.find('.swiper-tarih-yil').text().trim()
    const style = slide.attr('style') ?? ''
    const bg = style.match(/url\(['"]?([^'")]+)['"]?\)/i)?.[1]
    const imageUrl = bg && !/^https?:\/\//i.test(bg) ? `${baseUrl.replace(/\/$/, '')}/${bg.replace(/^\//, '')}` : bg

    cards.push({
      ...parsed,
      href: href.startsWith('http') ? href.split('?')[0] : `${baseUrl.replace(/\/$/, '')}/${href.replace(/^\//, '').split('?')[0]}`,
      title: title || undefined,
      venue: venue || undefined,
      day: day || undefined,
      month: month || undefined,
      year: year || undefined,
      imageUrl,
    })
  })

  return cards
}

export function parseBiletimgoStart(html: string): string | null {
  const node = findEventNode(html)
  if (node && typeof node.startDate === 'string') return node.startDate

  const $ = loadHtml(html)
  const labeled = $('[class*="etkinlikbilgi"], [class*="etkilikbilgi"], [class*="etkinlikyertarih"], meta[property="og:description"]')
    .toArray()
    .map((el) => ($(el).is('meta') ? $(el).attr('content') ?? '' : $(el).text()))
    .join(' ')
  const fromBlocks = parseTurkishDateTime(labeled)
  if (fromBlocks) return fromBlocks

  const baslangic = html.match(
    /Ba[şs]lang[ıi][cç]\s*<\/span>\s*((?:Ocak|Şubat|Mart|Nisan|May[ıi]s|Haziran|Temmuz|A[gğ]ustos|Eyl[uü]l|Ekim|Kas[ıi]m|Aral[ıi]k)\s+\d{1,2},?\s+\d{4}\s+\d{1,2}:\d{2})/i
  )
  if (baslangic) return parseTurkishDateTime(baslangic[1])
  return parseTurkishDateTime(stripHtml(html))
}

export function parseBiletimgoDetail(html: string, _pageUrl: string): {
  title: string
  description: string
  venue: string
  address: string
  city: string | null
  imageUrl: string | null
  startsAt: string | null
  endsAt: string | null
} {
  const node = findEventNode(html)
  if (node && typeof node.name === 'string') {
    const location = node.location as
      | { name?: string; address?: { streetAddress?: string; addressLocality?: string } }
      | undefined
    const image = Array.isArray(node.image) ? String(node.image[0] ?? '') : typeof node.image === 'string' ? node.image : ''
    return {
      title: node.name,
      description: typeof node.description === 'string' ? node.description : '',
      venue: location?.name ?? '',
      address: location?.address?.streetAddress ?? '',
      city: location?.address?.addressLocality ?? null,
      imageUrl: image && /biletimgo\.com\/images\//i.test(image) ? image : null,
      startsAt: typeof node.startDate === 'string' ? node.startDate : null,
      endsAt: typeof node.endDate === 'string' ? node.endDate : null,
    }
  }

  const $ = loadHtml(html)
  const ogTitle = $('meta[property="og:title"]').attr('content')?.replace(/\s+[–-]\s+Biletler ve Detaylar.*$/i, '').trim()
  const h1 = $('h1').first().text().trim()
  const title = ogTitle || h1
  const description = $('meta[property="og:description"]').attr('content')?.trim() ?? ''
  const imageUrl = $('meta[property="og:image"]').attr('content')?.trim() ?? null
  const placeBlock = $('.etkinlikyertarih').first().text().replace(/\s+/g, ' ').trim()
  const venue = placeBlock.replace(/\d{1,2}\s+\S+\s+\S+$/, '').trim()
  const addressMatch = html.match(
    /((?:[A-ZÇĞİÖŞÜa-zçğıöşü][A-ZÇĞİÖŞÜa-zçğıöşü\s.'-]+)\s\/\s*(?:[A-ZÇĞİÖŞÜa-zçğıöşü]{3,}))/
  )
  const address = addressMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
  const cityFromAddress = address.split('/').pop()?.trim() ?? null
  return {
    title,
    description,
    venue,
    address,
    city: cityFromAddress,
    imageUrl: imageUrl && /biletimgo\.com\/images\//i.test(imageUrl) ? imageUrl : null,
    startsAt: parseBiletimgoStart(html),
    endsAt: null,
  }
}

export function mapBiletimgoOccurrence(input: {
  numericId: string
  pageUrl: string
  title: string
  description?: string
  venue?: string
  address?: string
  city?: string | null
  citySlug?: string
  imageUrl?: string | null
  startsAt: string
  endsAt?: string | null
}): NaEvent | null {
  if (!isEventSpecificTicketUrl(input.pageUrl)) return null
  const cityName = input.city?.trim() || (input.citySlug ? getCityCategoryName(input.citySlug) : '')
  const districtFromSlash = input.address?.match(/([A-ZÇĞİÖŞÜa-zçğıöşü][A-ZÇĞİÖŞÜa-zçğıöşü\s.'-]*)\s\/\s*[A-ZÇĞİÖŞÜa-zçğıöşü]+$/)
  const districtSlug = districtFromSlash
    ? extractDistrictSlugFromText(districtFromSlash[1])
    : input.address
      ? extractDistrictSlugFromText(input.address)
      : null
  return normalizeEvent({
    providerId: 'biletimgo',
    providerLabel: 'BiletimGO',
    externalId: input.numericId,
    title: input.title,
    description: input.description ?? '',
    category: input.title,
    city: cityName || null,
    citySlug: input.citySlug ?? (cityName ? slugifyCity(cityName) : undefined),
    districtSlug,
    venue: input.venue ?? null,
    address: input.address ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? undefined,
    coverImageUrl: input.imageUrl ?? null,
    ticketUrl: input.pageUrl,
  })
}

export const biletimgoProvider: EventProvider = {
  id: 'biletimgo',
  label: 'BiletimGO',

  isEnabled() {
    return readEnv('BILETIMGO_ENABLED')?.toLowerCase() === 'true' && !isDisabledByEnv('BILETIMGO_DISABLED')
  },

  async fetchEvents(params: EventProviderParams): Promise<NaEvent[]> {
    if (!biletimgoProvider.isEnabled() && params.occurrenceFirst !== true) return []
    return (await biletimgoProvider.fetchWithDiagnostics!(params)).events
  },

  async fetchWithDiagnostics(params: EventProviderParams): Promise<ProviderFetchResult> {
    const diagnostics = createDiagnostics({ status: 'EMPTY' })
    const baseUrl = (readEnv('BILETIMGO_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    const citySlug = params.citySlug
    const plate = citySlug ? getProvincePlate(citySlug) : null
    const listingUrl = citySlug && plate
      ? `${baseUrl}/etkinlik-takvimi-${citySlug}-${plate}`
      : `${baseUrl}/sehir-etkinlikleri`
    const maxDetails = params.maxDetails ?? DEFAULT_MAX_DETAILS
    const events: NaEvent[] = []

    try {
      const listing = await fetchDocument(listingUrl)
      diagnostics.pagesFetched += 1

      if (looksLikeRateLimit(listing.status)) {
        diagnostics.status = 'RATE_LIMITED'
        diagnostics.message = `HTTP ${listing.status}`
        return { events, diagnostics }
      }
      if (looksLikeChallengePage(listing.text, listing.status) || listing.status === 403) {
        diagnostics.blocked = true
        diagnostics.status = 'BLOCKED'
        diagnostics.message = `HTTP ${listing.status}`
        return { events, diagnostics }
      }
      if (!listing.ok) {
        diagnostics.status = 'FETCH_FAILED'
        diagnostics.message = `HTTP ${listing.status}`
        return { events, diagnostics }
      }

      const cards = collectBiletimgoListingCards(listing.text, baseUrl)
      diagnostics.discovered = cards.length
      const fetchCap = Math.min(cards.length, maxDetails * 2)
      const budgeted = cards.slice(0, fetchCap)
      if (cards.length > maxDetails) diagnostics.status = 'PARTIAL'

      const details = await mapWithConcurrency(budgeted, DETAIL_CONCURRENCY, async (card) => {
        const detail = await fetchDocument(card.href)
        diagnostics.detailFetches += 1
        if (looksLikeChallengePage(detail.text, detail.status)) {
          diagnostics.blocked = true
          return null
        }
        if (!detail.ok) {
          diagnostics.invalid += 1
          return null
        }
        const parsed = parseBiletimgoDetail(detail.text, card.href)
        if (!parsed.startsAt || !parsed.title) {
          diagnostics.invalid += 1
          return null
        }
        const cityFromDetail = parsed.city ? slugifyCity(parsed.city) : ''
        if (citySlug && cityFromDetail && cityFromDetail !== citySlug) {
          return null
        }
        return mapBiletimgoOccurrence({
          numericId: card.numericId,
          pageUrl: card.href,
          title: parsed.title,
          description: parsed.description,
          venue: parsed.venue || card.venue,
          address: parsed.address,
          city: parsed.city,
          citySlug: cityFromDetail || citySlug,
          imageUrl: parsed.imageUrl || card.imageUrl,
          startsAt: parsed.startsAt,
          endsAt: parsed.endsAt,
        })
      })

      for (const event of details) {
        if (event) events.push(event)
      }
      return { events, diagnostics: finalizeDiagnostics(diagnostics, events) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      diagnostics.status = events.length > 0 ? 'PARTIAL' : 'FETCH_FAILED'
      diagnostics.message = message
      diagnostics.occurrences = events.length
      return { events, diagnostics }
    }
  },
}
