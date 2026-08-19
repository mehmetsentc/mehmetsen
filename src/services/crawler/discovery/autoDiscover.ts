import * as cheerio from 'cheerio'
import { fetchDocument, type FetchImpl } from '../http/fetchDocument'
import { parseRssOrAtom } from './rss'
import { parseSitemapXml } from './sitemap'
import { hostnameOf, normalizeArticleUrl } from '../url/normalize'
import type { HostLookup } from '../url/ssrf'
import type { CrawlerDiscoveryMethod } from '../types'

export const COMMON_FEED_PATHS = [
  '/rss',
  '/rss.xml',
  '/feed',
  '/feed/',
  '/atom.xml',
  '/rss/gundem',
  '/rss/anasayfa',
  '/feeds-haberler',
]

export const COMMON_SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/news-sitemap.xml',
  '/sitemap-news.xml',
  '/sitemap/news.xml',
  '/news-sitemap.xml.gz',
]

export interface ProbeHit {
  url: string
  kind: 'RSS' | 'ATOM' | 'SITEMAP' | 'NEWS_SITEMAP' | 'HOMEPAGE'
  itemCount: number
  status: number
}

export interface AutoDiscoverResult {
  domain: string
  baseUrl: string
  robotsUrl: string | null
  robotsSitemaps: string[]
  rssUrls: string[]
  sitemapUrls: string[]
  probes: ProbeHit[]
  suggestedDiscoveryMethod: CrawlerDiscoveryMethod
  language: string
  countryCode: string
  aiCalls: 0
}

function originOf(input: string): { domain: string; baseUrl: string } | null {
  const raw = input.trim()
  if (!raw) return null
  const withProto = raw.includes('://') ? raw : `https://${raw}`
  try {
    const u = new URL(withProto)
    const host = u.hostname.replace(/^www\./, '')
    return { domain: host, baseUrl: `${u.protocol}//${u.host}` }
  } catch {
    return null
  }
}

function looksLikeFeed(body: string, url: string): 'RSS' | 'ATOM' | null {
  const head = body.slice(0, 800).toLowerCase()
  if (head.includes('<rss') || head.includes('<rdf:rdf') || /<channel[\s>]/i.test(head)) return 'RSS'
  if (head.includes('<feed') && (head.includes('atom') || url.includes('atom'))) return 'ATOM'
  if (parseRssOrAtom(body, url).length) return head.includes('<feed') ? 'ATOM' : 'RSS'
  return null
}

function looksLikeSitemap(body: string): boolean {
  const head = body.slice(0, 800).toLowerCase()
  return head.includes('<urlset') || head.includes('<sitemapindex')
}

function parseRobotsSitemaps(text: string, baseUrl: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap:\s*(.+)$/i)
    if (!m) continue
    const url = normalizeArticleUrl(m[1].trim(), baseUrl)
    if (url) out.push(url)
  }
  return out
}

function homepageAlternates(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html)
  const urls: string[] = []
  $('link[rel="alternate"]').each((_i, el) => {
    const type = String($(el).attr('type') || '').toLowerCase()
    const href = $(el).attr('href')
    if (!href) return
    if (
      type.includes('rss') ||
      type.includes('atom') ||
      type.includes('xml')
    ) {
      const url = normalizeArticleUrl(href, baseUrl)
      if (url) urls.push(url)
    }
  })
  $('a[href]').each((_i, el) => {
    const href = String($(el).attr('href') || '')
    if (/rss|atom|feed|sitemap/i.test(href)) {
      const url = normalizeArticleUrl(href, baseUrl)
      if (url) urls.push(url)
    }
  })
  return [...new Set(urls)].slice(0, 12)
}

export async function autoDiscoverSource(opts: {
  domain: string
  fetchImpl?: FetchImpl
  lookup?: HostLookup
}): Promise<AutoDiscoverResult> {
  const parsed = originOf(opts.domain)
  if (!parsed) {
    return {
      domain: opts.domain,
      baseUrl: '',
      robotsUrl: null,
      robotsSitemaps: [],
      rssUrls: [],
      sitemapUrls: [],
      probes: [],
      suggestedDiscoveryMethod: 'LISTING',
      language: 'tr',
      countryCode: 'TR',
      aiCalls: 0,
    }
  }

  const probes: ProbeHit[] = []
  const rssUrls: string[] = []
  const sitemapUrls: string[] = []
  const robotsUrl = `${parsed.baseUrl}/robots.txt`
  let robotsSitemaps: string[] = []

  const robots = await fetchDocument({
    url: robotsUrl,
    fetchImpl: opts.fetchImpl,
    lookup: opts.lookup,
    skipPoliteness: true,
  })
  if (robots.ok) {
    robotsSitemaps = parseRobotsSitemaps(robots.body, parsed.baseUrl)
    sitemapUrls.push(...robotsSitemaps)
  }

  const home = await fetchDocument({
    url: parsed.baseUrl,
    fetchImpl: opts.fetchImpl,
    lookup: opts.lookup,
    skipPoliteness: true,
  })
  if (home.ok) {
    probes.push({ url: parsed.baseUrl, kind: 'HOMEPAGE', itemCount: 0, status: home.status })
    for (const alt of homepageAlternates(home.body, parsed.baseUrl)) {
      const kindGuess = /sitemap/i.test(alt) ? 'SITEMAP' : 'RSS'
      if (kindGuess === 'SITEMAP') sitemapUrls.push(alt)
      else rssUrls.push(alt)
    }
  }

  const candidates = [
    ...COMMON_FEED_PATHS.map((p) => ({ url: `${parsed.baseUrl}${p}`, expect: 'feed' as const })),
    ...COMMON_SITEMAP_PATHS.map((p) => ({ url: `${parsed.baseUrl}${p}`, expect: 'sitemap' as const })),
    ...robotsSitemaps.map((url) => ({ url, expect: 'sitemap' as const })),
  ]

  const seen = new Set<string>()
  for (const candidate of candidates.slice(0, 18)) {
    if (seen.has(candidate.url)) continue
    seen.add(candidate.url)
    const res = await fetchDocument({
      url: candidate.url,
      fetchImpl: opts.fetchImpl,
      lookup: opts.lookup,
      skipPoliteness: true,
    })
    if (!res.ok) continue
    const feedKind = looksLikeFeed(res.body, res.finalUrl)
    if (feedKind) {
      const items = parseRssOrAtom(res.body, parsed.baseUrl)
      rssUrls.push(res.finalUrl)
      probes.push({ url: res.finalUrl, kind: feedKind, itemCount: items.length, status: res.status })
      continue
    }
    if (looksLikeSitemap(res.body) || candidate.expect === 'sitemap') {
      const parsedMap = parseSitemapXml(res.body, parsed.baseUrl)
      const kind = /news/i.test(res.finalUrl) ? 'NEWS_SITEMAP' : 'SITEMAP'
      sitemapUrls.push(res.finalUrl)
      probes.push({
        url: res.finalUrl,
        kind,
        itemCount: parsedMap.items.length || parsedMap.childSitemaps.length,
        status: res.status,
      })
    }
  }

  const uniqueRss = [...new Set(rssUrls)]
  const uniqueSitemaps = [...new Set(sitemapUrls)]
  let suggestedDiscoveryMethod: CrawlerDiscoveryMethod = 'LISTING'
  if (uniqueRss.length) suggestedDiscoveryMethod = uniqueSitemaps.length ? 'HYBRID' : 'RSS'
  else if (uniqueSitemaps.some((u) => /news/i.test(u))) suggestedDiscoveryMethod = 'NEWS_SITEMAP'
  else if (uniqueSitemaps.length) suggestedDiscoveryMethod = 'SITEMAP'

  const host = hostnameOf(parsed.baseUrl) || parsed.domain
  const tld = host.split('.').pop()
  return {
    domain: parsed.domain,
    baseUrl: parsed.baseUrl,
    robotsUrl,
    robotsSitemaps,
    rssUrls: uniqueRss,
    sitemapUrls: uniqueSitemaps,
    probes,
    suggestedDiscoveryMethod,
    language: tld === 'tr' ? 'tr' : 'en',
    countryCode: tld === 'tr' ? 'TR' : 'US',
    aiCalls: 0,
  }
}
