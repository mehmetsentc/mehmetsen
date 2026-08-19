import { describe, expect, it } from 'vitest'
import { autoDiscoverSource } from './discovery/autoDiscover'
import { testCrawlerSource } from './testSource'
import { MemoryCrawlerStore } from './store/memory'
import { pickFairPending } from './scheduler'
import { isFreshEnough, shouldSkipStaleDiscovery } from './freshness'
import { computeSourceHealthScore, nextStatusForFailures } from './health'
import { classifySourceTest } from './classify'
import { TURKEY_SOURCE_REGISTRY } from './turkeyRegistry'
import { crawlerTickLimits } from './enabled'
import { runCrawlerTick } from './workers/tick'
import { dispatchCrawlerArticleToNewsroom } from './dispatch'
import { resetPolitenessForTests } from './http/politeness'
import { resetRobotsCacheForTests } from './http/robots'
import type { DiscoveredUrlRecord, NewsSourceRecord } from './types'

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Live</title><link>https://news.test/live</link><pubDate>Wed, 19 Aug 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`

const SITEMAP = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://news.test/old</loc><lastmod>2020-01-01</lastmod></url>
<url><loc>https://news.test/fresh</loc><lastmod>2026-08-19</lastmod></url>
</urlset>`

const HTML = `<!doctype html><html><head>
<link rel="alternate" type="application/rss+xml" href="/rss.xml" />
<script type="application/ld+json">${JSON.stringify({
  '@type': 'NewsArticle',
  headline: 'Live story',
  datePublished: '2026-08-19T10:00:00Z',
  articleBody:
    'The committee published the report after months of hearings. Members said the recommendations take effect next quarter across every office. Residents can read the summary and submit comments before the deadline.',
})}</script></head><body><article><p>Body</p></article></body></html>`

function mockFetch(map: Record<string, { status?: number; body?: string }>) {
  return async (input: RequestInfo | URL) => {
    const url = String(input).split('?')[0]
    if (url.endsWith('/robots.txt')) {
      return new Response('User-agent: *\nAllow: /\nSitemap: https://news.test/sitemap.xml\n', { status: 200 })
    }
    const hit = map[url]
    if (!hit) return new Response('missing', { status: 404 })
    return new Response(hit.body ?? '', { status: hit.status ?? 200 })
  }
}

describe('crawler phase 2', () => {
  it('has 50+ turkey registry sources with local geography fields', () => {
    expect(TURKEY_SOURCE_REGISTRY.length).toBeGreaterThanOrEqual(50)
    const local = TURKEY_SOURCE_REGISTRY.find((s) => s.key === 'biga')
    expect(local?.scope).toBe('DISTRICT')
    expect(local?.city).toBe('Çanakkale')
    expect(local?.district).toBe('Biga')
    expect(TURKEY_SOURCE_REGISTRY.every((s) => s.domain && s.name)).toBe(true)
  })

  it('auto-discovers RSS and sitemap without AI', async () => {
    const result = await autoDiscoverSource({
      domain: 'news.test',
      lookup: async () => ['93.184.216.34'],
      fetchImpl: mockFetch({
        'https://news.test': { body: HTML },
        'https://news.test/rss.xml': { body: RSS },
        'https://news.test/sitemap.xml': { body: SITEMAP },
      }),
    })
    expect(result.aiCalls).toBe(0)
    expect(result.rssUrls.some((u) => u.includes('rss.xml'))).toBe(true)
    expect(result.sitemapUrls.length).toBeGreaterThan(0)
  })

  it('test source does not persist and never calls AI', async () => {
    process.env.NEWS_CRAWLER_MIN_INTERVAL_MS = '0'
    resetPolitenessForTests()
    resetRobotsCacheForTests()
    const persist = new MemoryCrawlerStore()
    const result = await testCrawlerSource({
      store: persist,
      persist: false,
      fetchImpl: mockFetch({
        'https://news.test/rss.xml': { body: RSS },
        'https://news.test/live': { body: HTML },
      }),
      lookup: async () => ['93.184.216.34'],
      input: {
        name: 'Test',
        domain: 'news.test',
        baseUrl: 'https://news.test',
        countryCode: 'TR',
        language: 'tr',
        rssUrls: ['https://news.test/rss.xml'],
      },
    })
    expect(await persist.listSources()).toHaveLength(0)
    expect(result.persisted).toBe(false)
    expect(result.dispatch.aiRequests).toBe(0)
    expect(result.proposed.country).toBe('TR')
  })

  it('fair scheduling does not let one source take the whole tick', () => {
    const mk = (id: string, sourceId: string, t: number): DiscoveredUrlRecord =>
      ({
        id,
        sourceId,
        url: `https://x/${id}`,
        normalizedUrl: `https://x/${id}`,
        canonicalUrl: null,
        urlHash: id,
        discoveredAt: new Date(t),
        publishedAtHint: null,
        status: 'PENDING_FETCH',
        fetchAttempts: 0,
        lastFetchAttempt: null,
        failureReason: null,
        etag: null,
        lastModified: null,
        logicalQueue: 'ARTICLE_FETCH_QUEUE',
        discoveryLane: 'CRAWLER',
        discoveryLanes: ['CRAWLER'],
        titleHint: null,
        guid: null,
        discoveryPrimaryImageCandidate: null,
        rssDescription: null,
        feedMetadata: null,
      })
    const pending = [
      mk('a1', 'A', 1),
      mk('a2', 'A', 2),
      mk('a3', 'A', 3),
      mk('a4', 'A', 4),
      mk('b1', 'B', 5),
      mk('c1', 'C', 6),
    ]
    const src = (id: string, band: NewsSourceRecord['crawlPriority']): NewsSourceRecord =>
      ({
        id,
        name: id,
        domain: `${id}.test`,
        baseUrl: `https://${id}.test`,
        countryCode: 'TR',
        countryName: 'Türkiye',
        region: null,
        city: null,
        district: null,
        language: 'tr',
        timezone: null,
        sourceType: 'NATIONAL',
        status: 'ACTIVE',
        priority: band === 'HIGH' ? 70 : 50,
        trustTier: 3,
        discoveryMethod: 'RSS',
        rssUrls: [],
        sitemapUrls: [],
        listingUrls: [],
        crawlIntervalSeconds: 360,
        articleFetchMode: 'HTTP',
        requiresJavascript: false,
        robotsPolicy: 'FOLLOW',
        lastDiscoveryAt: null,
        nextDiscoveryAt: null,
        lastSuccessfulDiscoveryAt: null,
        lastFeedEtag: null,
        lastFeedModified: null,
        consecutiveFailures: 0,
        averageResponseMs: null,
        articlesDiscovered: 0,
        articlesFetched: 0,
        extractionSuccessRate: null,
        geographicScope: 'NATIONAL',
        sourceCategory: 'GENERAL',
        crawlPriority: band,
        qualityTier: 'TIER_A',
        healthScore: 80,
        freshnessHours: 48,
        lastPauseReason: null,
        registryKey: id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    const picked = pickFairPending({
      pending,
      sources: new Map([
        ['A', src('A', 'HIGH')],
        ['B', src('B', 'NORMAL')],
        ['C', src('C', 'LOW')],
      ]),
      limit: 4,
      maxPerSource: 2,
    })
    const counts = picked.reduce<Record<string, number>>((acc, row) => {
      acc[row.sourceId] = (acc[row.sourceId] || 0) + 1
      return acc
    }, {})
    expect(counts.A).toBeLessThanOrEqual(2)
    expect(counts.B).toBeGreaterThanOrEqual(1)
    expect(counts.C).toBeGreaterThanOrEqual(1)
  })

  it('enforces global fetch budget and freshness', async () => {
    const limits = crawlerTickLimits()
    expect(limits.maxFetchPerTick).toBeGreaterThan(0)
    expect(limits.maxFetchPerSource).toBeGreaterThan(0)
    expect(limits.maxTickRuntimeMs).toBeLessThanOrEqual(55_000)
    expect(isFreshEnough(new Date(), 48)).toBe(true)
    expect(isFreshEnough(new Date('2020-01-01'), 48)).toBe(false)
    expect(
      shouldSkipStaleDiscovery({
        publishedAt: new Date('2020-01-01'),
        freshnessHours: 48,
        discoveryMethod: 'SITEMAP',
      })
    ).toBe(true)
    expect(
      shouldSkipStaleDiscovery({
        publishedAt: null,
        freshnessHours: 48,
        discoveryMethod: 'RSS',
      })
    ).toBe(false)
  })

  it('health score and auto-degrade/pause are deterministic', () => {
    const healthy = computeSourceHealthScore({
      discoverySuccessRate: 1,
      fetchSuccessRate: 1,
      extractionSuccessRate: 1,
      averageConfidence: 0.8,
      httpErrorRate: 0,
      duplicateRate: 0.1,
      freshArticleRate: 1,
      requiresJavascript: false,
    })
    expect(healthy).toBeGreaterThan(80)
    expect(nextStatusForFailures(3).status).toBe('DEGRADED')
    expect(nextStatusForFailures(6).status).toBe('PAUSED')
    expect(nextStatusForFailures(0).status).toBe('ACTIVE')
  })

  it('classifies tiers without AI', () => {
    expect(
      classifySourceTest({
        discovered: 5,
        fetchedOk: 3,
        extractedOk: 3,
        avgWords: 400,
        avgConfidence: 0.78,
        imageRate: 1,
        dateRate: 1,
        blocked: false,
        jsLikely: false,
      }).tier
    ).toBe('TIER_A')
    expect(
      classifySourceTest({
        discovered: 5,
        fetchedOk: 3,
        extractedOk: 2,
        avgWords: 160,
        avgConfidence: 0.5,
        imageRate: 0,
        dateRate: 0,
        blocked: false,
        jsLikely: false,
      }).tier
    ).toBe('TIER_B')
    expect(classifySourceTest({
      discovered: 4,
      fetchedOk: 3,
      extractedOk: 0,
      avgWords: 0,
      avgConfidence: 0,
      imageRate: 0,
      dateRate: 0,
      blocked: false,
      jsLikely: true,
    }).tier).toBe('TIER_C')
    expect(classifySourceTest({
      discovered: 0,
      fetchedOk: 0,
      extractedOk: 0,
      avgWords: 0,
      avgConfidence: 0,
      imageRate: 0,
      dateRate: 0,
      blocked: true,
      jsLikely: false,
    }).tier).toBe('BLOCKED')
  })

  it('tick respects per-source and global fetch limits with zero AI', async () => {
    process.env.NEWS_CRAWLER_MIN_INTERVAL_MS = '0'
    process.env.NEWS_CRAWLER_MAX_FETCH_PER_TICK = '3'
    process.env.NEWS_CRAWLER_MAX_FETCH_PER_SOURCE = '1'
    resetPolitenessForTests()
    resetRobotsCacheForTests()
    const store = new MemoryCrawlerStore()
    const a = await store.insertSource({
      name: 'A',
      domain: 'a.test',
      baseUrl: 'https://a.test',
      countryCode: 'TR',
      language: 'tr',
      rssUrls: ['https://a.test/rss.xml'],
      status: 'ACTIVE',
    })
    const b = await store.insertSource({
      name: 'B',
      domain: 'b.test',
      baseUrl: 'https://b.test',
      countryCode: 'TR',
      language: 'tr',
      rssUrls: ['https://b.test/rss.xml'],
      status: 'ACTIVE',
    })
    await store.updateSource(a.id, { nextDiscoveryAt: new Date(0) })
    await store.updateSource(b.id, { nextDiscoveryAt: new Date(0) })
    const html = HTML
    const rssA = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>A1</title><link>https://a.test/1</link><pubDate>Wed, 19 Aug 2026 10:00:00 GMT</pubDate></item>
<item><title>A2</title><link>https://a.test/2</link><pubDate>Wed, 19 Aug 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`
    const rssB = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>B1</title><link>https://b.test/1</link><pubDate>Wed, 19 Aug 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`
    const result = await runCrawlerTick({
      store,
      enabled: true,
      lookup: async () => ['93.184.216.34'],
      fetchImpl: async (input) => {
        const url = String(input)
        if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\n', { status: 200 })
        if (url === 'https://a.test/rss.xml') return new Response(rssA, { status: 200 })
        if (url === 'https://b.test/rss.xml') return new Response(rssB, { status: 200 })
        return new Response(html, { status: 200 })
      },
    })
    expect(result.articlesFetched).toBeLessThanOrEqual(3)
    expect(result.aiRequests).toBe(0)
    expect(dispatchCrawlerArticleToNewsroom().aiRequests).toBe(0)
    delete process.env.NEWS_CRAWLER_MAX_FETCH_PER_TICK
    delete process.env.NEWS_CRAWLER_MAX_FETCH_PER_SOURCE
  })
})
