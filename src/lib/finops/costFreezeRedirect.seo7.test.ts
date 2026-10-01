/**
 * SEO-7.1 — maintenance mode is the next.config `redirects()` catch-all (root
 * middleware.ts is not compiled). Crawl discovery files must not match it, or
 * GSC receives /bakim.html for sitemaps ("Sitemap is HTML", 29 Sep).
 */
import { describe, expect, it, vi } from 'vitest'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'

vi.mock('../costFreeze', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../costFreeze')>()),
  COST_FREEZE_ENABLED: true,
}))

async function maintenanceMatcher() {
  const { default: config } = await import('../../../next.config')
  const redirects = await config.redirects!()
  const gate = redirects.find((r) => r.destination === '/bakim.html')
  expect(gate, 'maintenance redirect present when frozen').toBeTruthy()
  return getPathMatch(gate!.source, { strict: true })
}

describe('SEO-7.1 maintenance redirect spares crawl discovery files', () => {
  it.each([
    '/robots.txt',
    '/sitemap.xml',
    '/news-sitemap.xml',
    '/images-sitemap.xml',
    '/video-sitemap.xml',
    '/sitemaps/articles-2026-10.xml',
    '/news-sitemaps/0.xml',
    '/sitemap-categories.xml',
    '/sitemap-cities.xml',
    '/sitemap/0.xml',
    '/api/health',
  ])('%s is not redirected', async (path) => {
    const match = await maintenanceMatcher()
    expect(match(path)).toBe(false)
  })

  it.each(['/', '/haber/x', '/kategori/spor', '/api/feed/v2'])(
    '%s is redirected to /bakim.html',
    async (path) => {
      const match = await maintenanceMatcher()
      expect(match(path)).not.toBe(false)
    }
  )
})
