import * as cheerio from 'cheerio'
import { slugifyCity } from '@/lib/location'
import { getCityCategoryName } from '@/constants/cities'
import { buildEventFingerprint, eventIdentityKey } from '@/lib/eventDedupe'
import type { EventCategory, NaEvent } from '@/types/event'

export { eventIdentityKey } from '@/lib/eventDedupe'

/**
 * Shared helpers for ticket-platform adapters: env reading, a guarded fetch,
 * category/date normalization, and a deterministic id so the same external
 * event always produces the same `NaEvent.id` across requests (which lets the
 * aggregator dedupe reliably).
 *
 * Server-only: do not import from client components.
 */

const DEFAULT_PROVIDER_TIMEOUT_MS = 12_000

/**
 * Realistic desktop browser User-Agent. Some platforms reject requests with no
 * (or an obviously bot-like) UA. This is best-effort and does not bypass real
 * bot protection (e.g. Cloudflare challenges).
 */
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Reads a server env var, returning `undefined` for empty/whitespace values. */
export function readEnv(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** True unless the named env var is explicitly set to "true" (opt-out flag). */
export function isDisabledByEnv(name: string): boolean {
  return readEnv(name)?.toLowerCase() === 'true'
}

/** Lightweight dev log so provider activity is visible without noise in prod. */
export function providerLog(provider: string, message: string, data?: unknown) {
  if (process.env.NODE_ENV === 'production') return
  if (data !== undefined) {
    console.log(`[eventProvider:${provider}] ${message}`, data)
  } else {
    console.log(`[eventProvider:${provider}] ${message}`)
  }
}

function withBrowserHeaders(init: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      ...(init.headers as Record<string, string> | undefined),
    },
    // Provider data is live; never let Next cache the upstream response.
    cache: 'no-store',
  }
}

/** `fetch` with an abort-based timeout. Throws on non-2xx or timeout. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...withBrowserHeaders(init), signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

/** `fetch` returning the raw response text. Throws on non-2xx or timeout. */
export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS
): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...withBrowserHeaders({
        headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        ...init,
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Runs `fn` over `items` with a bounded concurrency. Used to fetch a handful of
 * detail pages without opening dozens of sockets at once. Rejections from `fn`
 * are surfaced; callers should make `fn` swallow its own errors when desired.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Maps a free-form provider category/genre label to our `EventCategory`.
 * Falls back to `other` for anything unrecognized.
 */
export function mapCategory(raw: string | null | undefined): EventCategory {
  const value = (raw ?? '').toLocaleLowerCase('tr-TR').trim()
  if (!value) return 'other'

  const has = (...needles: string[]) => needles.some((n) => value.includes(n))

  // Order matters: more specific buckets are checked before the broad "music →
  // concert" rule, so e.g. a "Müzik Festivali" maps to `festival`, not `concert`.
  if (has('festival', 'fest')) return 'festival'
  if (has('parti', 'party', 'dj', 'club', 'gece', 'nightlife', 'after')) return 'party'
  if (has('sergi', 'exhibition', 'müze', 'museum', 'expo', 'fuar')) return 'exhibition'
  if (has('tiyatro', 'theatre', 'theater', 'sahne', 'oyun', 'stand', 'gösteri', 'show', 'arts'))
    return 'theater'
  if (has('sinema', 'film', 'cinema', 'movie')) return 'cinema'
  if (has('konser', 'concert', 'müzik', 'music', 'live')) return 'concert'
  return 'other'
}

/**
 * Parses a provider date into an ISO 8601 string. Accepts ISO strings, epoch
 * millis/seconds, and `Date`. Returns `null` when unparseable so callers can
 * drop the record instead of emitting an invalid event.
 */
export function toIso(value: unknown): string | null {
  if (value == null) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value === 'number') {
    // Heuristic: 10-digit values are epoch seconds, 13-digit are millis.
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  return null
}

/** Coerces an unknown to a finite number, or `undefined`. */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/**
 * Small, dependency-free deterministic hash (FNV-1a, base36). Used to build a
 * stable id from an external event's identity so re-fetches dedupe cleanly.
 */
export function stableHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export interface NormalizeInput {
  providerId: string
  providerLabel: string
  /** Provider's own id for the event, if any (used to strengthen the hash). */
  externalId?: string | null
  title: string
  description?: string | null
  category?: string | null
  city?: string | null
  citySlug?: string | null
  venue?: string | null
  address?: string | null
  startsAt: unknown
  endsAt?: unknown
  coverImageUrl?: string | null
  ticketUrl?: string | null
  lat?: unknown
  lng?: unknown
}

/**
 * Normalizes a provider payload into a `NaEvent`. Returns `null` when the
 * record is unusable (missing title or unparseable start date) so adapters can
 * simply `.filter(Boolean)` the results.
 */
export function normalizeEvent(input: NormalizeInput): NaEvent | null {
  const title = input.title?.trim()
  if (!title) return null

  const startsAt = toIso(input.startsAt)
  if (!startsAt) return null

  const endsAt = toIso(input.endsAt) ?? undefined

  const cityName = input.city?.trim() || ''
  const citySlug = (input.citySlug?.trim() || (cityName ? slugifyCity(cityName) : '')) || ''
  const displayCity = cityName || (citySlug ? getCityCategoryName(citySlug) : '')

  const venue = input.venue?.trim() || ''

  const identity = eventIdentityKey({ title, startsAt, venue })
  const sourceHash = stableHash(`${input.externalId ?? ''}|${identity}`)
  const id = `${input.providerId}_${sourceHash}`

  const description = input.description?.trim() || ''
  const category = mapCategory(input.category)

  const event: NaEvent = {
    id,
    title,
    description,
    category,
    city: displayCity,
    citySlug,
    venue,
    startsAt,
    createdAt: new Date().toISOString(),
    status: 'published',
    source: input.providerId,
    provider: input.providerLabel,
    sourceHash,
    sourceId: input.externalId?.trim() || sourceHash,
  }

  if (input.externalId?.trim()) event.externalId = input.externalId.trim()

  if (endsAt) event.endsAt = endsAt
  if (input.address?.trim()) event.address = input.address.trim()
  if (input.coverImageUrl?.trim()) event.coverImageUrl = input.coverImageUrl.trim()
  if (input.ticketUrl?.trim()) event.ticketUrl = input.ticketUrl.trim()

  const lat = toNumber(input.lat)
  const lng = toNumber(input.lng)
  if (lat !== undefined && lng !== undefined) {
    event.lat = lat
    event.lng = lng
  }

  event.fingerprint = buildEventFingerprint(event)

  return event
}

/** Strips HTML tags from a snippet (provider descriptions are often HTML). */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return cheerio.load(`<div>${html}</div>`)('div').text().replace(/\s+/g, ' ').trim()
}

/**
 * Parses all `<script type="application/ld+json">` blocks from an HTML document
 * and returns the flattened list of JSON-LD nodes (expanding `@graph`). Invalid
 * JSON blocks are skipped. Used to read schema.org `Event` data, which is the
 * most stable thing to scrape when a site exposes it.
 */
export function extractJsonLd(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html)
  const nodes: Record<string, unknown>[] = []

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text()
    if (!raw.trim()) return
    try {
      const parsed = JSON.parse(raw) as unknown
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          if (Array.isArray(obj['@graph'])) {
            for (const g of obj['@graph']) {
              if (g && typeof g === 'object') nodes.push(g as Record<string, unknown>)
            }
          } else {
            nodes.push(obj)
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  })

  return nodes
}

/** Returns the first JSON-LD node whose `@type` is (or includes) "Event". */
export function findEventNode(html: string): Record<string, unknown> | null {
  for (const node of extractJsonLd(html)) {
    const type = node['@type']
    const types = Array.isArray(type) ? type : [type]
    if (types.some((t) => typeof t === 'string' && t.toLowerCase().includes('event'))) {
      return node
    }
  }
  return null
}

/** Loads an HTML string into a cheerio instance (re-export for adapters). */
export function loadHtml(html: string) {
  return cheerio.load(html)
}
