import { hostnameOf } from './url/normalize'
import { TURKEY_SOURCE_REGISTRY } from './turkeyRegistry'
import type { NewsSourceRecord } from './types'

const EXPLICIT_ALIASES: Record<string, string> = {
  gazeteduvar: 'duvar',
  'independent-tr': 'indyturk',
  'euronews-tr': 'euronews',
  bbc: 'bbctr',
  'ntv-spor': 'ntvspor',
  'dunya-ekonomi': 'dunya',
  birgün: 'birgun',
  birgun: 'birgun',
  'dw-english': 'dwtr',
  'dw-tr': 'dwtr',
}

const REGISTRY_KEYS = TURKEY_SOURCE_REGISTRY.map((e) => e.key).sort((a, b) => b.length - a.length)

export function canonicalLegacyRegistryKey(legacySourceId: string): string {
  const id = legacySourceId.trim().toLowerCase()
  if (!id) return id
  if (EXPLICIT_ALIASES[id]) return EXPLICIT_ALIASES[id]
  for (const key of REGISTRY_KEYS) {
    if (id === key || id.startsWith(`${key}-`)) return key
  }
  return id
}

function hostVariants(host: string): string[] {
  const h = host.toLowerCase().replace(/^www\./, '')
  return h ? [h, `www.${h}`] : []
}

function feedHost(feedUrl: string): string | null {
  const host = hostnameOf(feedUrl)
  return host ? host.replace(/^www\./, '') : null
}

export type LegacySourceMapping =
  | { mapped: true; source: NewsSourceRecord; via: 'registry_key' | 'domain' | 'feed_url' }
  | { mapped: false; registryKey: string; reason: 'unmapped_legacy_source' }

export function mapLegacySourceToNewsSource(opts: {
  legacySourceId: string
  feedUrl?: string | null
  articleUrl?: string | null
  sources: NewsSourceRecord[]
}): LegacySourceMapping {
  const registryKey = canonicalLegacyRegistryKey(opts.legacySourceId)
  const byKey = opts.sources.find((s) => (s.registryKey || '').toLowerCase() === registryKey)
  if (byKey) return { mapped: true, source: byKey, via: 'registry_key' }

  const feed = opts.feedUrl?.trim()
  if (feed) {
    const byFeed = opts.sources.find((s) =>
      s.rssUrls.some((u) => u.replace(/\/$/, '') === feed.replace(/\/$/, ''))
    )
    if (byFeed) return { mapped: true, source: byFeed, via: 'feed_url' }
  }

  const hosts = new Set<string>()
  if (opts.feedUrl) {
    const h = feedHost(opts.feedUrl)
    if (h && h !== 'news.google.com' && h !== 'news.google.com.tr') hosts.add(h)
  }
  if (opts.articleUrl) {
    const h = hostnameOf(opts.articleUrl)?.replace(/^www\./, '')
    if (h) hosts.add(h)
  }

  for (const host of hosts) {
    const variants = new Set(hostVariants(host))
    const byDomain = opts.sources.find((s) => variants.has(s.domain.replace(/^www\./, '')) || variants.has(s.domain))
    if (byDomain) return { mapped: true, source: byDomain, via: 'domain' }
  }

  return { mapped: false, registryKey, reason: 'unmapped_legacy_source' }
}

export function crawlerOwnsLegacyFeed(opts: {
  mapping: LegacySourceMapping
  feedUrl?: string | null
}): boolean {
  if (!opts.mapping.mapped) return false
  const source = opts.mapping.source
  if (source.status !== 'ACTIVE' && source.status !== 'DEGRADED') return false
  const feed = opts.feedUrl?.trim()
  if (!feed) return source.rssUrls.length > 0
  const normalized = feed.replace(/\/$/, '')
  return source.rssUrls.some((u) => u.replace(/\/$/, '') === normalized)
}
