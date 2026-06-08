import type { EventProvider, EventProviderParams } from './types'
import {
  extractJsonLd,
  fetchText,
  isDisabledByEnv,
  normalizeEvent,
  providerLog,
  readEnv,
  stripHtml,
  toNumber,
} from './shared'
import type { NaEvent } from '@/types/event'

/**
 * Biletino — best-effort adapter (usually SKIPPED at runtime).
 *
 * ⚠️ Biletino sits behind Cloudflare bot protection: plain server-side requests
 * receive HTTP 403 (verified). Without a headless browser (explicitly out of
 * scope) we cannot get past the challenge, so in practice this adapter returns
 * [] and contributes nothing — it never throws or breaks the aggregate.
 *
 * It is still wired up so that IF Biletino is reachable (e.g. via an allowlisted
 * proxy/partner endpoint set in `BILETINO_BASE_URL`) we parse any schema.org
 * `Event` JSON-LD from its pages. Disabled by default to avoid a guaranteed 403
 * on every aggregation; set `BILETINO_ENABLED=true` (and ideally a working
 * `BILETINO_BASE_URL`) to attempt it.
 */

const DEFAULT_BASE_URL = 'https://biletino.com'

interface JsonLdEventNode {
  '@type'?: unknown
  name?: unknown
  description?: unknown
  startDate?: unknown
  endDate?: unknown
  image?: unknown
  url?: unknown
  location?: {
    name?: string
    address?: { streetAddress?: string; addressLocality?: string }
    geo?: { latitude?: number | string; longitude?: number | string }
  }
}

function isEventNode(node: Record<string, unknown>): boolean {
  const type = (node as JsonLdEventNode)['@type']
  const types = Array.isArray(type) ? type : [type]
  return types.some((t) => typeof t === 'string' && t.toLowerCase().includes('event'))
}

export const biletinoProvider: EventProvider = {
  id: 'biletino',
  label: 'Biletino',

  isEnabled() {
    // Opt-in: avoid a guaranteed Cloudflare 403 on every request by default.
    return readEnv('BILETINO_ENABLED')?.toLowerCase() === 'true' && !isDisabledByEnv('BILETINO_DISABLED')
  },

  async fetchEvents(params: EventProviderParams): Promise<NaEvent[]> {
    const baseUrl = (readEnv('BILETINO_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    const citySlug = params.citySlug

    try {
      const url = citySlug ? `${baseUrl}/tr/search?city=${encodeURIComponent(citySlug)}` : `${baseUrl}/tr`
      providerLog('biletino', 'fetching', { url })
      const html = await fetchText(url)

      const events = extractJsonLd(html)
        .filter(isEventNode)
        .map((raw) => {
          const node = raw as JsonLdEventNode
          const image = node.image
          const coverImageUrl = Array.isArray(image)
            ? (image[0] as string)
            : typeof image === 'string'
              ? image
              : null
          return normalizeEvent({
            providerId: 'biletino',
            providerLabel: 'Biletino',
            externalId: typeof node.url === 'string' ? node.url : null,
            title: typeof node.name === 'string' ? node.name : '',
            description: stripHtml(typeof node.description === 'string' ? node.description : ''),
            category: typeof node.name === 'string' ? node.name : '',
            city: node.location?.address?.addressLocality ?? null,
            citySlug,
            venue: node.location?.name ?? null,
            address: node.location?.address?.streetAddress ?? null,
            startsAt: node.startDate,
            endsAt: node.endDate ?? null,
            coverImageUrl,
            ticketUrl: typeof node.url === 'string' ? node.url : null,
            lat: toNumber(node.location?.geo?.latitude),
            lng: toNumber(node.location?.geo?.longitude),
          })
        })
        .filter((e): e is NaEvent => e !== null)

      providerLog('biletino', `normalized ${events.length} event(s)`)
      return events
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      providerLog('biletino', `fetch failed (likely Cloudflare 403): ${message} — returning []`)
      return []
    }
  },
}
