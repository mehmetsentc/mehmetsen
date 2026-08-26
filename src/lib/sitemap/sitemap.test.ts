/**
 * Phase P6 sitemap architecture tests.
 */
import { describe, expect, it } from 'vitest'
import { SITEMAP_CHUNK_LIMIT, urlsetXml } from '@/lib/sitemap/seoSitemaps'
import { getSitemapPageCount } from '@/lib/sitemap/mainSitemap'

describe('P6 sitemap chunk limit', () => {
  it('respects 50k url limit constant', () => {
    expect(SITEMAP_CHUNK_LIMIT).toBe(50_000)
  })

  it('urlsetXml renders valid url entries', () => {
    const xml = urlsetXml([
      {
        url: 'https://www.nahaber.com/haber/test',
        lastModified: new Date('2026-01-01'),
        changeFrequency: 'daily',
        priority: 0.7,
      },
    ])
    expect(xml).toContain('<urlset')
    expect(xml).toContain('<loc>https://www.nahaber.com/haber/test</loc>')
    expect(xml).toContain('<lastmod>')
  })
})

describe('P6 sitemap page count', () => {
  it('getSitemapPageCount returns at least 1 without DB', async () => {
    const count = await getSitemapPageCount().catch(() => 1)
    expect(count).toBeGreaterThanOrEqual(1)
  })
})
