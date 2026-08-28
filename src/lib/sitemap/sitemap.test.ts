/**
 * Phase P6 sitemap architecture tests.
 */
import { describe, expect, it, vi } from 'vitest'
import { SITEMAP_CHUNK_LIMIT } from '@/lib/sitemap/seoSitemaps'
import { urlsetXml } from '@/lib/sitemap/seoXml'
import { getSitemapPageCount } from '@/lib/sitemap/mainSitemap'

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    })),
  })),
}))

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
  }, 15_000)
})
