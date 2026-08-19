import { describe, expect, it } from 'vitest'
import { MemoryCrawlerStore } from './store/memory'
import { testCrawlerSource } from './testSource'
import { resetPolitenessForTests } from './http/politeness'
import { resetRobotsCacheForTests } from './http/robots'

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Live</title><link>https://news.test/live</link></item>
</channel></rss>`

const HTML = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  '@type': 'NewsArticle',
  headline: 'Live story',
  datePublished: '2026-08-19T10:00:00Z',
  articleBody:
    'The committee published the report after months of hearings. Members said the recommendations take effect next quarter across every office. Residents can read the summary and submit comments before the deadline.',
})}</script></head><body></body></html>`

describe('testCrawlerSource', () => {
  it('discovers, fetches, extracts, and never dispatches AI', async () => {
    process.env.NEWS_CRAWLER_MIN_INTERVAL_MS = '0'
    resetPolitenessForTests()
    resetRobotsCacheForTests()
    const store = new MemoryCrawlerStore()
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('robots.txt')) return new Response('User-agent: *\nAllow: /\n', { status: 200 })
      if (url.includes('rss.xml')) return new Response(RSS, { status: 200 })
      if (url.includes('/live')) return new Response(HTML, { status: 200 })
      return new Response('missing', { status: 404 })
    }
    const result = await testCrawlerSource({
      store,
      fetchImpl,
      lookup: async () => ['93.184.216.34'],
      input: {
        name: 'Test',
        domain: 'news.test',
        baseUrl: 'https://news.test',
        countryCode: 'US',
        language: 'en',
        discoveryMethod: 'RSS',
        rssUrls: ['https://news.test/rss.xml'],
      },
    })
    expect(result.discovery.inserted).toBe(1)
    expect(result.fetch?.ok).toBe(true)
    expect(result.extraction?.titleFound).toBe(true)
    expect(result.extraction?.wordCount).toBeGreaterThan(20)
    expect(result.dispatch.dispatched).toBe(false)
    expect(result.dispatch.aiRequests).toBe(0)
  })
})
