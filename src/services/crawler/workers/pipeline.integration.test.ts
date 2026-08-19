import { describe, expect, it } from 'vitest'
import { MemoryCrawlerStore } from '../store/memory'
import { runCrawlerTick } from './tick'
import { resetPolitenessForTests } from '../http/politeness'
import { resetRobotsCacheForTests } from '../http/robots'

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>First</title><link>https://news.test/first</link></item>
<item><title>Second</title><link>https://news.test/second</link></item>
<item><title>First again</title><link>https://news.test/first?utm_source=x</link></item>
</channel></rss>`

function articleHtml(title: string, extra = '') {
  return `<!doctype html><html lang="en"><head>
<script type="application/ld+json">${JSON.stringify({
    '@type': 'NewsArticle',
    headline: title,
    datePublished: '2026-08-18T12:00:00Z',
    articleBody:
      'The city council approved the measure after hours of debate. Officials said implementation starts next month for every district office. Residents were asked to follow published guidance and attend the follow-up hearing.',
  })}</script>
</head><body><article><p>${extra}The city council approved the measure after hours of debate.</p>
<p>Officials said implementation starts next month for every district office.</p>
<p>Residents were asked to follow published guidance and attend the follow-up hearing.</p></article></body></html>`
}

function mockFetch(bodies: Record<string, { status?: number; body?: string; etag?: string }>): typeof fetch {
  return async (input) => {
    const url = String(input)
    const key = url.split('?')[0]
    if (key.endsWith('/robots.txt')) {
      return new Response('User-agent: *\nAllow: /\n', { status: 200 })
    }
    const hit = bodies[key] || bodies[url]
    if (!hit) return new Response('missing', { status: 404 })
    return new Response(hit.body ?? '', {
      status: hit.status ?? 200,
      headers: hit.etag ? { etag: hit.etag } : undefined,
    })
  }
}

describe('crawler pipeline integration', () => {
  it('discovers new RSS URLs, fetches, extracts RawArticle, skips duplicates, uses no AI', async () => {
    process.env.NEWS_CRAWLER_MIN_INTERVAL_MS = '0'
    resetPolitenessForTests()
    resetRobotsCacheForTests()
    const store = new MemoryCrawlerStore()
    const source = await store.insertSource({
      name: 'News Test',
      domain: 'news.test',
      baseUrl: 'https://news.test',
      countryCode: 'US',
      language: 'en',
      status: 'ACTIVE',
      discoveryMethod: 'RSS',
      rssUrls: ['https://news.test/rss.xml'],
      crawlIntervalSeconds: 120,
      robotsPolicy: 'FOLLOW',
    })
    await store.updateSource(source.id, { nextDiscoveryAt: new Date(0) })

    const fetchImpl = mockFetch({
      'https://news.test/rss.xml': { body: RSS, etag: '"v1"' },
      'https://news.test/first': { body: articleHtml('First story') },
      'https://news.test/second': { body: articleHtml('Second story') },
    })

    const lookup = async () => ['93.184.216.34']
    const result = await runCrawlerTick({
      store,
      fetchImpl,
      lookup,
      enabled: true,
      now: new Date('2026-08-18T12:05:00Z'),
    })

    expect(result.enabled).toBe(true)
    expect(result.urlsInserted).toBe(2)
    expect(store.urls.size).toBe(2)
    expect(result.articlesFetched).toBeGreaterThan(0)
    expect(result.aiRequests).toBe(0)
    expect([...store.articles.values()].every((a) => a.aiEligibility === 'SKIPPED')).toBe(true)
    expect([...store.articles.values()].every((a) => a.articleBodyText && a.articleBodyText.length > 200)).toBe(true)
    expect([...store.articles.values()].every((a) => a.language === 'en')).toBe(true)

    await store.updateSource(source.id, { nextDiscoveryAt: new Date(0), status: 'ACTIVE' })
    const second = await runCrawlerTick({
      store,
      fetchImpl,
      lookup,
      enabled: true,
      now: new Date('2026-08-18T12:10:00Z'),
    })
    expect(second.urlsInserted).toBe(0)

    const disabled = await runCrawlerTick({ store, enabled: false })
    expect(disabled.skipped).toBe(true)
    expect(disabled.reason).toContain('CRAWLER_ENABLED=false')
  })
})
