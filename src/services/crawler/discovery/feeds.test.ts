import { describe, expect, it } from 'vitest'
import { parseAtomFeed, parseRssFeed, parseRssOrAtom } from './rss'
import { parseSitemapXml } from './sitemap'

const RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Feed</title>
    <item>
      <title>One</title>
      <link>https://news.test/a?utm_source=rss</link>
      <pubDate>Mon, 18 Aug 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Two</title>
      <guid isPermaLink="true">https://news.test/b</guid>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom story</title>
    <link href="https://news.test/atom-1"/>
    <published>2026-08-18T09:00:00Z</published>
  </entry>
</feed>`

const SITEMAP = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url>
    <loc>https://news.test/sitemap-story</loc>
    <news:news>
      <news:title>Sitemap story</news:title>
      <news:publication_date>2026-08-18T08:00:00Z</news:publication_date>
    </news:news>
  </url>
</urlset>`

const INDEX = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://news.test/news-sitemap.xml</loc></sitemap>
</sitemapindex>`

describe('feed parsers', () => {
  it('parses RSS and strips tracking', () => {
    const items = parseRssFeed(RSS)
    expect(items.map((i) => i.url)).toEqual(['https://news.test/a', 'https://news.test/b'])
    expect(items[0].title).toBe('One')
    expect(items[0].publishedAt?.toISOString()).toContain('2026-08-18')
  })

  it('parses Atom', () => {
    const items = parseAtomFeed(ATOM)
    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://news.test/atom-1')
  })

  it('falls back from RSS to Atom', () => {
    expect(parseRssOrAtom(ATOM)).toHaveLength(1)
  })

  it('parses news sitemap', () => {
    const parsed = parseSitemapXml(SITEMAP)
    expect(parsed.kind).toBe('urlset')
    expect(parsed.items[0].url).toBe('https://news.test/sitemap-story')
  })

  it('parses sitemap index', () => {
    const parsed = parseSitemapXml(INDEX)
    expect(parsed.kind).toBe('index')
    expect(parsed.childSitemaps[0]).toBe('https://news.test/news-sitemap.xml')
  })
})
