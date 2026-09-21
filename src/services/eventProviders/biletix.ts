import type { EventProvider, EventProviderParams, ProviderFetchResult } from './types'
import {
  fetchDocument,
  fetchJson,
  isDisabledByEnv,
  normalizeEvent,
  providerLog,
  readEnv,
  stripHtml,
} from './shared'
import { getBiletixSolrCityName } from '@/constants/cities'
import { createDiagnostics, finalizeDiagnostics, isOccurrenceFirstRequested } from './diagnostics'
import { isRangeContainer, looksLikeChallengePage, looksLikeRateLimit } from './occurrence'
import { biletixEventUrl, isEventSpecificTicketUrl } from './ticketUrl'
import type { NaEvent } from '@/types/event'

/**
 * Biletix (Ticketmaster Türkiye).
 *
 * Solr `type:event` is a container index (verified: no `type:performance`).
 * Public eventPerformance sitemap lists `/performance/{CODE}/{N}/TURKIYE/tr`
 * URLs but no dates; performance HTML returns 401 identify. Occurrence-first
 * therefore emits only same-calendar-day Solr docs and attaches a performance
 * URL only when the sitemap has exactly one TR loc for that event code.
 */

const DEFAULT_SOLR_URL = 'https://www.biletix.com/solr/tr/select'
const DEFAULT_ROWS = 150
export const BILETIX_OCCURRENCE_ROWS = 100
const OCCURRENCE_ROWS = BILETIX_OCCURRENCE_ROWS
const DEFAULT_MAX_PAGES = 8
const DEFAULT_IMAGE_BASE =
  'https://www.biletix.com/static/images/live/event/eventimages/960x540'
const PERFORMANCE_SITEMAP = 'https://www.biletix.com/wbtxapi/api/v1/siteMap/eventPerformance'

export interface BiletixDoc {
  id?: string
  name?: string | string[]
  sname?: string
  description?: string
  start?: string
  end?: string
  city?: string | string[]
  venue?: string | string[]
  category?: string
  subcategory?: string
  image_url?: string
  link_url?: string
  type?: string
}

interface BiletixSolrResponse {
  response?: { numFound?: number; docs?: BiletixDoc[] }
}

export interface BiletixPerformanceIndex {
  countByCode: Map<string, number>
  uniqueUrlByCode: Map<string, string>
  postersByCode: Map<string, string>
}

function firstString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? ''
  return value?.trim() ?? ''
}

export function buildBiletixImageUrl(imageFile: string | undefined): string | null {
  if (!imageFile) return null
  if (/^https?:\/\//i.test(imageFile)) return imageFile
  const base = readEnv('BILETIX_IMAGE_BASE') ?? DEFAULT_IMAGE_BASE
  return `${base.replace(/\/$/, '')}/${imageFile.replace(/^\//, '')}`
}

export function isBiletixContainerDoc(doc: BiletixDoc): boolean {
  return isRangeContainer(doc.start, doc.end)
}

export function isBiletixNonEventDoc(doc: BiletixDoc): boolean {
  const venue = firstString(doc.venue).toLocaleLowerCase('tr-TR')
  const subcategory = (doc.subcategory ?? '').toLocaleLowerCase('tr-TR')
  const name = (firstString(doc.name) || doc.sname || '').toLocaleLowerCase('tr-TR')
  if (venue.includes('ilgili ürün')) return true
  if (subcategory.includes('urunsatisi')) return true
  if (name.includes('upsell')) return true
  return false
}

export function parseBiletixPerformanceSitemap(xml: string): {
  countByCode: Map<string, number>
  uniqueUrlByCode: Map<string, string>
} {
  const countByCode = new Map<string, number>()
  const uniqueUrlByCode = new Map<string, string>()
  const re = /<loc>\s*(https:\/\/www\.biletix\.com\/performance\/([A-Za-z0-9]+)\/(\d{3})\/TURKIYE\/tr)\s*<\/loc>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    const url = match[1]
    const code = match[2]
    countByCode.set(code, (countByCode.get(code) ?? 0) + 1)
    uniqueUrlByCode.set(code, url)
  }
  for (const [code, count] of countByCode) {
    if (count !== 1) uniqueUrlByCode.delete(code)
  }
  return { countByCode, uniqueUrlByCode }
}

export function mapBiletixDoc(
  doc: BiletixDoc,
  options: { ticketUrl?: string | null; skipContainers?: boolean } = {}
): NaEvent | null {
  if (!doc.id) return null
  if (options.skipContainers && isBiletixContainerDoc(doc)) return null

  const title = firstString(doc.name) || doc.sname || ''
  const ticketUrl =
    options.ticketUrl ||
    (doc.link_url?.trim() && isEventSpecificTicketUrl(doc.link_url) ? doc.link_url.trim() : '') ||
    biletixEventUrl(doc.id)

  return normalizeEvent({
    providerId: 'biletix',
    providerLabel: 'Biletix',
    externalId: doc.id,
    title,
    description: stripHtml(doc.description),
    category: `${doc.subcategory ?? ''} ${doc.category ?? ''} ${title}`,
    city: firstString(doc.city) || null,
    venue: firstString(doc.venue) || null,
    startsAt: doc.start,
    endsAt: doc.end ?? null,
    coverImageUrl: buildBiletixImageUrl(doc.image_url),
    ticketUrl,
  })
}

function solrHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    Referer: 'https://www.biletix.com/',
    Origin: 'https://www.biletix.com',
  }
}

function buildSolrBody(params: EventProviderParams, start: number, rows: number): string {
  const body = new URLSearchParams()
  body.set('q', '*:*')
  body.set('wt', 'json')
  body.set('rows', String(rows))
  body.set('start', String(start))
  body.append('fq', 'type:event')
  if (params.citySlug) {
    body.append('fq', `city:${getBiletixSolrCityName(params.citySlug)}`)
  }
  return body.toString()
}

let sitemapCache: { expiresAt: number; index: ReturnType<typeof parseBiletixPerformanceSitemap> } | null = null

export async function loadBiletixPerformanceIndex(): Promise<ReturnType<typeof parseBiletixPerformanceSitemap> | null> {
  if (sitemapCache && sitemapCache.expiresAt > Date.now()) return sitemapCache.index
  const doc = await fetchDocument(PERFORMANCE_SITEMAP, {}, 20_000)
  if (!doc.ok || looksLikeChallengePage(doc.text, doc.status)) return null
  const index = parseBiletixPerformanceSitemap(doc.text)
  sitemapCache = { expiresAt: Date.now() + 20 * 60 * 1000, index }
  return index
}

export function resetBiletixSitemapCache() {
  sitemapCache = null
}

async function fetchLegacy(params: EventProviderParams): Promise<NaEvent[]> {
  const url = readEnv('BILETIX_API_URL') ?? DEFAULT_SOLR_URL
  const body = buildSolrBody(params, 0, DEFAULT_ROWS)
  try {
    providerLog('biletix', 'querying solr', { citySlug: params.citySlug })
    const data = await fetchJson<BiletixSolrResponse>(url, {
      method: 'POST',
      headers: solrHeaders(),
      body,
    })
    const docs = data.response?.docs ?? []
    return docs.map((doc) => mapBiletixDoc(doc)).filter((e): e is NaEvent => e !== null)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    providerLog('biletix', `fetch failed: ${message} — returning []`)
    return []
  }
}

export const biletixProvider: EventProvider = {
  id: 'biletix',
  label: 'Biletix',

  isEnabled() {
    return !isDisabledByEnv('BILETIX_DISABLED')
  },

  async fetchEvents(params: EventProviderParams): Promise<NaEvent[]> {
    if (isOccurrenceFirstRequested(params)) {
      return (await biletixProvider.fetchWithDiagnostics!(params)).events
    }
    return fetchLegacy(params)
  },

  async fetchWithDiagnostics(params: EventProviderParams): Promise<ProviderFetchResult> {
    const diagnostics = createDiagnostics({ status: 'EMPTY' })
    const url = readEnv('BILETIX_API_URL') ?? DEFAULT_SOLR_URL
    const maxPages = Math.min(params.maxPages ?? DEFAULT_MAX_PAGES, 20)
    const events: NaEvent[] = []
    const seen = new Set<string>()

    let performanceIndex: ReturnType<typeof parseBiletixPerformanceSitemap> | null = null
    try {
      performanceIndex = await loadBiletixPerformanceIndex()
      if (performanceIndex) diagnostics.pagesFetched += 1
    } catch {
      performanceIndex = null
    }

    try {
      for (let page = 0; page < maxPages; page += 1) {
        const start = page * OCCURRENCE_ROWS
        const doc = await fetchDocument(url, {
          method: 'POST',
          headers: solrHeaders(),
          body: buildSolrBody(params, start, OCCURRENCE_ROWS),
        })
        diagnostics.pagesFetched += 1

        if (looksLikeRateLimit(doc.status)) {
          diagnostics.status = events.length > 0 ? 'PARTIAL' : 'RATE_LIMITED'
          diagnostics.message = `HTTP ${doc.status}`
          break
        }
        if (looksLikeChallengePage(doc.text, doc.status) || doc.status === 401 || doc.status === 403) {
          diagnostics.blocked = true
          diagnostics.status = events.length > 0 ? 'PARTIAL' : 'BLOCKED'
          diagnostics.message = `HTTP ${doc.status}`
          break
        }
        if (!doc.ok) {
          diagnostics.status = events.length > 0 ? 'PARTIAL' : 'FETCH_FAILED'
          diagnostics.message = `HTTP ${doc.status}`
          break
        }

        const data = JSON.parse(doc.text) as BiletixSolrResponse
        const docs = data.response?.docs ?? []
        if (page === 0 && typeof data.response?.numFound === 'number') {
          diagnostics.numFound = data.response.numFound
        }
        diagnostics.discovered += docs.length
        if (docs.length === 0) break

        for (const raw of docs) {
          if (!raw.id || seen.has(raw.id)) continue
          seen.add(raw.id)

          if (isBiletixNonEventDoc(raw)) {
            diagnostics.invalid += 1
            continue
          }
          const performanceCount = performanceIndex?.countByCode.get(raw.id) ?? 0
          const isRange = isBiletixContainerDoc(raw)
          const isMultiPerf = performanceCount > 1
          if (isRange || isMultiPerf) {
            diagnostics.containers += 1
            diagnostics.skippedContainers += 1
            diagnostics.rangeContainers = (diagnostics.rangeContainers ?? 0) + (isRange ? 1 : 0)
            diagnostics.multiPerformanceContainers =
              (diagnostics.multiPerformanceContainers ?? 0) + (isMultiPerf ? 1 : 0)
            continue
          }

          const uniquePerformance = performanceIndex?.uniqueUrlByCode.get(raw.id)
          const mapped = mapBiletixDoc(raw, {
            skipContainers: true,
            ticketUrl: uniquePerformance ?? biletixEventUrl(raw.id),
          })
          if (!mapped) {
            diagnostics.invalid += 1
            continue
          }
          events.push(mapped)
        }

        const numFound = data.response?.numFound ?? 0
        if (start + docs.length >= numFound) break
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
