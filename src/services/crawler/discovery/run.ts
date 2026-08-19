import { ingestDiscoveredArticle } from '../ingestDiscoveredArticle'
import { parseRssOrAtom } from './rss'
import { parseSitemapXml } from './sitemap'
import { parseListingPage } from './listing'
import { fetchDocument, type FetchImpl } from '../http/fetchDocument'
import { crawlerTickLimits } from '../enabled'
import { logCrawler } from '../log'
import { normalizeArticleUrl } from '../url/normalize'
import { shouldSkipStaleDiscovery } from '../freshness'
import type { HostLookup } from '../url/ssrf'
import type { CrawlerStore } from '../store/types'
import type { DiscoveredFeedItem, NewsSourceRecord } from '../types'

export async function discoverSource(opts: {
  source: NewsSourceRecord
  store: CrawlerStore
  fetchImpl?: FetchImpl
  lookup?: HostLookup
}): Promise<{ discovered: number; inserted: number; notModified: boolean; errorCode?: string }> {
  const limits = crawlerTickLimits()
  const { source, store } = opts
  const methods = methodsFor(source)
  let items: DiscoveredFeedItem[] = []
  let notModified = false
  let errorCode: string | undefined
  let lastEtag = source.lastFeedEtag
  let lastModified = source.lastFeedModified

  for (const method of methods) {
    const urls =
      method === 'RSS' || method === 'ATOM'
        ? source.rssUrls
        : method === 'NEWS_SITEMAP' || method === 'SITEMAP'
          ? source.sitemapUrls
          : source.listingUrls
    if (!urls.length) continue

    for (const feedUrl of urls.slice(0, 3)) {
      const res = await fetchDocument({
        url: feedUrl,
        fetchImpl: opts.fetchImpl,
        lookup: opts.lookup,
        sourceId: source.id,
        conditional: { etag: source.lastFeedEtag, lastModified: source.lastFeedModified },
      })
      await store.incrementMetric('http_requests')
      if (res.notModified) {
        notModified = true
        continue
      }
      if (!res.ok) {
        errorCode = res.errorCode || `HTTP_${res.status}`
        continue
      }
      lastEtag = res.etag
      lastModified = res.lastModified
      if (method === 'LISTING') {
        items = items.concat(parseListingPage(res.body, res.finalUrl))
      } else if (method === 'SITEMAP' || method === 'NEWS_SITEMAP') {
        const sitemap = parseSitemapXml(res.body, res.finalUrl)
        items = items.concat(sitemap.items)
        if (sitemap.kind === 'index') {
          for (const child of sitemap.childSitemaps.slice(0, limits.maxChildSitemaps)) {
            const childRes = await fetchDocument({
              url: child,
              fetchImpl: opts.fetchImpl,
              lookup: opts.lookup,
              sourceId: source.id,
            })
            await store.incrementMetric('http_requests')
            if (!childRes.ok) continue
            items = items.concat(parseSitemapXml(childRes.body, childRes.finalUrl).items)
          }
        }
      } else {
        items = items.concat(parseRssOrAtom(res.body, res.finalUrl))
      }
    }
    if (items.length) break
  }

  const unique = new Map<string, DiscoveredFeedItem>()
  for (const item of items) {
    const normalized = normalizeArticleUrl(item.url, source.baseUrl)
    if (!normalized) continue
    if (!unique.has(normalized)) unique.set(normalized, { ...item, url: normalized })
  }

  const freshnessHours = source.freshnessHours || limits.defaultFreshnessHours
  const fresh = [...unique.values()].filter(
    (item) =>
      !shouldSkipStaleDiscovery({
        publishedAt: item.publishedAt,
        freshnessHours,
        discoveryMethod: source.discoveryMethod,
      })
  )
  const staleSkipped = unique.size - fresh.length
  if (staleSkipped > 0) await store.incrementMetric('stale_skipped', staleSkipped)

  const sliced = fresh.slice(0, limits.maxDiscoverUrlsPerSource)
  let inserted = 0
  const lane = source.discoveryMethod === 'RSS' || source.discoveryMethod === 'ATOM' ? 'RSS' as const : 'CRAWLER' as const
  const discoveryType =
    source.discoveryMethod === 'ATOM'
      ? 'ATOM'
      : source.discoveryMethod === 'LISTING'
        ? 'LISTING'
        : source.discoveryMethod === 'NEWS_SITEMAP' || source.discoveryMethod === 'SITEMAP'
          ? 'SITEMAP'
          : 'RSS'
  for (const item of sliced) {
    const result = await ingestDiscoveredArticle(
      store,
      {
        discoveryType,
        discoveryLane: lane,
        sourceId: source.id,
        originalUrl: item.url,
        titleHint: item.title,
        publishedAtHint: item.publishedAt ?? null,
        guid: item.guid ?? null,
        discoveryPrimaryImageCandidate: item.imageUrl ?? null,
        rssDescription: item.description ?? null,
        discoveredAt: new Date(),
      },
      { baseUrl: source.baseUrl }
    )
    await store.incrementMetric('urls_discovered')
    if (result.status === 'inserted') {
      inserted += 1
      await store.incrementMetric('urls_new')
    }
  }

  logCrawler(
    {
      sourceId: source.id,
      stage: 'discovery',
      errorCode,
    },
    { discovered: sliced.length, inserted, method: source.discoveryMethod }
  )

  await store.updateSource(source.id, {
    lastFeedEtag: lastEtag,
    lastFeedModified: lastModified,
  })

  return { discovered: sliced.length, inserted, notModified, errorCode }
}

function methodsFor(source: NewsSourceRecord): Array<'RSS' | 'ATOM' | 'NEWS_SITEMAP' | 'SITEMAP' | 'LISTING'> {
  if (source.discoveryMethod === 'HYBRID') return ['RSS', 'ATOM', 'NEWS_SITEMAP', 'SITEMAP', 'LISTING']
  if (source.discoveryMethod === 'RSS') return ['RSS']
  if (source.discoveryMethod === 'ATOM') return ['ATOM']
  if (source.discoveryMethod === 'NEWS_SITEMAP') return ['NEWS_SITEMAP']
  if (source.discoveryMethod === 'SITEMAP') return ['SITEMAP']
  return ['LISTING']
}
