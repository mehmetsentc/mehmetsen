import Parser from 'rss-parser'
import { createHash } from 'node:crypto'
import type { RssFeedFormat, RssSourceDefinition } from '@/services/rss/sources'

export interface RssFeedItem {
  source: RssSourceDefinition
  guid: string
  link: string
  title: string
  summary: string
  content: string
  publishedAt: number | null
  imageUrl: string | null
  fingerprint: string
}

const FEED_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 NaHaber-NewsBot/1.0 (+https://nahaber.app)',
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Referer: 'https://www.google.com/',
}

const parser = new Parser({
  timeout: 20_000,
  headers: FEED_HEADERS,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['enclosure', 'enclosure'],
      ['image', 'image'],
    ],
  },
})

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractImage(item: Parser.Item): string | null {
  const rawItem = item as Parser.Item & {
    enclosure?: { url?: string; type?: string }
    mediaContent?: Array<{ $?: { url?: string; type?: string } }>
    mediaThumbnail?: Array<{ $?: { url?: string } }>
    image?: string | { url?: string }
  }

  const enclosure = rawItem.enclosure
  if (enclosure?.url && (!enclosure.type || enclosure.type.startsWith('image/'))) {
    return enclosure.url
  }

  const mediaContent = rawItem.mediaContent
  if (Array.isArray(mediaContent)) {
    for (const m of mediaContent) {
      const url = m.$?.url
      const type = m.$?.type ?? ''
      if (url && (!type || type.startsWith('image/'))) return url
    }
  }

  const mediaThumb = rawItem.mediaThumbnail
  if (Array.isArray(mediaThumb) && mediaThumb[0]?.$?.url) {
    return mediaThumb[0].$.url
  }

  const imageField = rawItem.image
  if (typeof imageField === 'string' && imageField.trim()) {
    return imageField.trim()
  }
  if (imageField && typeof imageField === 'object' && imageField.url?.trim()) {
    return imageField.url.trim()
  }

  const raw = `${item.content ?? ''} ${item.contentSnippet ?? ''} ${item.summary ?? ''}`
  const imgMatch = raw.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (imgMatch?.[1]) return imgMatch[1]

  return null
}

function parsePublishedAt(item: Parser.Item): number | null {
  if (item.isoDate) {
    const t = Date.parse(item.isoDate)
    if (!Number.isNaN(t)) return t
  }
  if (item.pubDate) {
    const t = Date.parse(item.pubDate)
    if (!Number.isNaN(t)) return t
  }
  return null
}

export function buildRssFingerprint(sourceId: string, guid: string): string {
  return createHash('sha256').update(`${sourceId}:${guid}`).digest('hex').slice(0, 40)
}

export interface FetchRssItemsOptions {
  /** Skip items older than this epoch ms */
  minPublishedAt?: number
  /** Max items to return after filtering/sorting */
  maxItems?: number
}

/** Fix common malformed XML before rss-parser (e.g. Sözcü legacy feeds). */
export function sanitizeRssXml(xml: string): string {
  let out = xml.replace(/^\uFEFF/, '').trim()

  // Drop HTML wrapper pages mistaken for feeds.
  if (out.startsWith('<!doctype') || out.startsWith('<!DOCTYPE') || out.startsWith('<html')) {
    throw new Error('not recognized as RSS')
  }

  // Repair orphan boolean attributes (`<tag attr>` → `<tag attr="attr">`).
  out = out.replace(/<([a-zA-Z0-9:_-]+)([^>]*?)>/g, (match, tag, attrs) => {
    if (attrs.includes('=') || !attrs.trim()) return match
    const fixed = attrs.replace(/\s([a-zA-Z_:][\w:.-]*)(?=\s|\/|$)/g, ' $1="$1"')
    return `<${tag}${fixed}>`
  })

  // Strip illegal control chars except tab/newline/carriage return.
  out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

  return out
}

async function fetchFeedBody(url: string, attempt = 0): Promise<string> {
  const res = await fetch(url, {
    headers: FEED_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  })

  if (!res.ok) {
    if (attempt < 2 && (res.status === 403 || res.status === 429 || res.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
      return fetchFeedBody(url, attempt + 1)
    }
    throw new Error(`${res.status}`)
  }

  return res.text()
}

function detectFeedFormat(url: string, body: string, explicit?: RssFeedFormat): RssFeedFormat {
  if (explicit) return explicit
  if (url.includes('xml_mobile.php') || body.includes('<haberler>')) return 'trt-xml'
  return 'rss'
}

function parseTrtDate(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(
    /^(\w{3}),\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/,
    '$1, $2 $3 GMT'
  )
  const t = Date.parse(normalized)
  return Number.isNaN(t) ? null : t
}

function readCdataBlock(xml: string, tag: string): string {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i').exec(xml)
  if (cdata?.[1]) return cdata[1].trim()
  const plain = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, 'i').exec(xml)
  return plain?.[1]?.trim() ?? ''
}

function parseTrtXmlItems(body: string, source: RssSourceDefinition, cap: number): RssFeedItem[] {
  const blocks = body.match(/<haber>[\s\S]*?<\/haber>/gi) ?? []
  const items: RssFeedItem[] = []

  for (const block of blocks.slice(0, cap * 3)) {
    const id = readCdataBlock(block, 'haber_id') || readCdataBlock(block, 'haber_link')
    const title = readCdataBlock(block, 'haber_manset')
    const linkPath = readCdataBlock(block, 'haber_link')
    if (!id || !title) continue

    const link = linkPath.startsWith('http')
      ? linkPath
      : `https://www.trthaber.com/${linkPath.replace(/^\//, '')}`

    const summary = stripHtml(readCdataBlock(block, 'haber_aciklama'))
    const content = stripHtml(readCdataBlock(block, 'haber_metni')) || summary
    const imageUrl =
      readCdataBlock(block, 'haber_resim') || readCdataBlock(block, 'manset_resim') || null
    const publishedAt = parseTrtDate(readCdataBlock(block, 'haber_tarihi'))

    items.push({
      source,
      guid: id,
      link,
      title,
      summary: summary || content.slice(0, 400),
      content,
      publishedAt,
      imageUrl: imageUrl || null,
      fingerprint: buildRssFingerprint(source.id, id),
    })
  }

  return items
}

async function parseStandardFeed(url: string, body: string) {
  const sanitized = sanitizeRssXml(body)
  return parser.parseString(sanitized)
}

function normalizeParserItems(
  feed: Awaited<ReturnType<typeof parser.parseString>>,
  source: RssSourceDefinition,
  scanLimit: number
): RssFeedItem[] {
  const rawItems = (feed.items ?? []).slice(0, scanLimit)
  const normalized: RssFeedItem[] = []

  for (const item of rawItems) {
    const link = item.link?.trim() ?? item.guid?.trim() ?? ''
    const guid = item.guid?.trim() || link
    const title = item.title?.trim() ?? ''
    if (!guid || !title) continue

    const itemRecord = item as Parser.Item & { 'content:encoded'?: string }
    const htmlBody =
      item.content ??
      itemRecord['content:encoded'] ??
      item.summary ??
      item.contentSnippet ??
      ''
    const plain = stripHtml(typeof htmlBody === 'string' ? htmlBody : '')
    const snippet = stripHtml(item.contentSnippet ?? item.summary ?? '')

    normalized.push({
      source,
      guid,
      link: link || guid,
      title,
      summary: snippet || plain.slice(0, 400),
      content: plain,
      publishedAt: parsePublishedAt(item),
      imageUrl: extractImage(item),
      fingerprint: buildRssFingerprint(source.id, guid),
    })
  }

  return normalized
}

async function fetchFromUrl(
  source: RssSourceDefinition,
  url: string,
  cap: number
): Promise<RssFeedItem[]> {
  const body = await fetchFeedBody(url)
  const format = detectFeedFormat(url, body, source.feedFormat)

  if (format === 'trt-xml') {
    return parseTrtXmlItems(body, source, cap)
  }

  const feed = await parseStandardFeed(url, body)
  return normalizeParserItems(feed, source, Math.max(cap, source.maxItemsPerRun) * 3)
}

function filterAndSortItems(
  items: RssFeedItem[],
  options?: FetchRssItemsOptions,
  cap?: number
): RssFeedItem[] {
  const limit = cap ?? options?.maxItems ?? items[0]?.source.maxItemsPerRun ?? 3
  let filtered = items

  if (options?.minPublishedAt != null) {
    // Reject undated items when an age gate is active — null dates used to
    // bypass freshness and inflate the queue with unknown-age stories.
    filtered = items.filter(
      (item) => item.publishedAt != null && item.publishedAt >= options.minPublishedAt!
    )
  }

  filtered.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
  return filtered.slice(0, limit)
}

/**
 * Fetch and normalize items from a single RSS source.
 * Returns newest items first, capped by `source.maxItemsPerRun`.
 */
export async function fetchRssItems(
  source: RssSourceDefinition,
  options?: FetchRssItemsOptions
): Promise<RssFeedItem[]> {
  const cap = options?.maxItems ?? source.maxItemsPerRun
  const urls = [source.feedUrl, ...(source.alternateFeedUrls ?? [])]
  let lastError: Error | null = null

  for (const url of urls) {
    try {
      const items = await fetchFromUrl(source, url, cap)
      if (items.length === 0) continue
      return filterAndSortItems(items, options, cap)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error('RSS fetch failed')
}
