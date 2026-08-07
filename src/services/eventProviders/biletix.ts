import type { EventProvider, EventProviderParams } from './types'
import {
  fetchJson,
  isDisabledByEnv,
  normalizeEvent,
  providerLog,
  readEnv,
  stripHtml,
} from './shared'
import { getBiletixSolrCityName } from '@/constants/cities'
import type { NaEvent } from '@/types/event'

/**
 * Biletix (Ticketmaster Türkiye) — LIVE adapter.
 *
 * Biletix has no documented public API, but its own site search is powered by a
 * public Solr endpoint that returns clean JSON:
 *
 *   POST https://www.biletix.com/solr/tr/select
 *   body: q=*:*&wt=json&rows=N&start=0[&fq=city:<DisplayName>]
 *
 * We call it server-side and normalize the docs. This is far more stable than
 * scraping the JS-rendered HTML. No credentials required, so the adapter is
 * enabled by default (set `BILETIX_DISABLED=true` to turn it off).
 *
 * Reliability/ToS caveat: this is an undocumented internal endpoint. It can
 * change or rate-limit at any time; the adapter fails soft (returns []).
 *
 * Cover images: the Solr docs carry only an image filename (e.g.
 * "5IF02_19201080.avif"). Biletix serves the real file from
 * `https://www.biletix.com/static/images/live/event/eventimages/` (a `960x540/`
 * sized variant also exists and is lighter for cards). Those URLs load fine;
 * the client routes them through `/api/events/image` for caching/robustness.
 * Override the base with `BILETIX_IMAGE_BASE` if Biletix moves it.
 */

const DEFAULT_SOLR_URL = 'https://www.biletix.com/solr/tr/select'
const DEFAULT_ROWS = 150
const DEFAULT_IMAGE_BASE =
  'https://www.biletix.com/static/images/live/event/eventimages/960x540'
const EVENT_URL = (id: string) => `https://www.biletix.com/etkinlik/${id}/TURKIYE/tr`

interface BiletixDoc {
  id?: string
  name?: string
  sname?: string
  description?: string
  start?: string
  end?: string
  city?: string
  venue?: string
  category?: string
  subcategory?: string
  image_url?: string
  link_url?: string
}

interface BiletixSolrResponse {
  response?: { numFound?: number; docs?: BiletixDoc[] }
}

function buildImageUrl(imageFile: string | undefined): string | null {
  if (!imageFile) return null
  // Already an absolute URL? Use as-is.
  if (/^https?:\/\//i.test(imageFile)) return imageFile
  const base = readEnv('BILETIX_IMAGE_BASE') ?? DEFAULT_IMAGE_BASE
  return `${base.replace(/\/$/, '')}/${imageFile.replace(/^\//, '')}`
}

export const biletixProvider: EventProvider = {
  id: 'biletix',
  label: 'Biletix',

  isEnabled() {
    return !isDisabledByEnv('BILETIX_DISABLED')
  },

  async fetchEvents(params: EventProviderParams): Promise<NaEvent[]> {
    const url = readEnv('BILETIX_API_URL') ?? DEFAULT_SOLR_URL

    // Solr params. Filtering by city uses the display name (e.g. "İstanbul").
    const body = new URLSearchParams()
    body.set('q', '*:*')
    body.set('wt', 'json')
    body.set('rows', String(DEFAULT_ROWS))
    body.set('start', '0')
    body.append('fq', 'type:event')
    if (params.citySlug) {
      body.append('fq', `city:${getBiletixSolrCityName(params.citySlug)}`)
    }

    try {
      providerLog('biletix', 'querying solr', { citySlug: params.citySlug })
      const data = await fetchJson<BiletixSolrResponse>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Biletix Solr endpoint is same-origin in-browser; server-side requests
          // need matching Referer/Origin so the endpoint doesn't reject them.
          'Referer': 'https://www.biletix.com/',
          'Origin': 'https://www.biletix.com',
        },
        body: body.toString(),
      })

      const docs = data.response?.docs ?? []
      const events = docs
        .map((doc) => {
          if (!doc.id) return null
          return normalizeEvent({
            providerId: 'biletix',
            providerLabel: 'Biletix',
            externalId: doc.id,
            title: doc.name ?? doc.sname ?? '',
            description: stripHtml(doc.description),
            // Combine signals so the category mapper has the best chance.
            category: `${doc.subcategory ?? ''} ${doc.category ?? ''} ${doc.name ?? ''}`,
            city: doc.city ?? null,
            venue: doc.venue ?? null,
            startsAt: doc.start,
            endsAt: doc.end ?? null,
            coverImageUrl: buildImageUrl(doc.image_url),
            ticketUrl: doc.link_url?.trim() || EVENT_URL(doc.id),
          })
        })
        .filter((e): e is NaEvent => e !== null)

      providerLog('biletix', `normalized ${events.length} event(s)`)
      return events
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      providerLog('biletix', `fetch failed: ${message} — returning []`)
      return []
    }
  },
}
