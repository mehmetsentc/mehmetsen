import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { costFreezeDecision } from '@/lib/costFreeze'
import { createTtlSingleCache } from '@/lib/sitemap/imageSitemapCache'
import { NEWS_SITEMAP_CACHE_CONTROL, NEWS_SITEMAP_REVALIDATE_S } from '@/lib/sitemap/newsSitemap'

const DISCOVERY = [
  '/robots.txt',
  '/sitemap.xml',
  '/news-sitemap.xml',
  '/images-sitemap.xml',
  '/video-sitemap.xml',
  '/sitemaps/articles-2026-09.xml',
  '/news-sitemaps/news-1.xml',
]

describe('P2 cost freeze keeps search files', () => {
  it('does not turn robots or sitemaps into the maintenance HTML page', () => {
    for (const path of DISCOVERY) {
      expect(costFreezeDecision(path), path).toBe('pass')
    }
    expect(costFreezeDecision('/haber/ornek')).toBe('html')
    expect(costFreezeDecision('/api/cron/crawler/tick')).toBe('api')
    const middleware = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')
    expect(middleware.indexOf('const decision = costFreezeDecision')).toBeLessThan(
      middleware.indexOf('new NextResponse(COST_FREEZE_HTML')
    )
  })
})

describe('P2 news sitemap cache', () => {
  it('refreshes every 30–60 minutes', () => {
    expect(NEWS_SITEMAP_REVALIDATE_S).toBeGreaterThanOrEqual(30 * 60)
    expect(NEWS_SITEMAP_REVALIDATE_S).toBeLessThanOrEqual(60 * 60)
    expect(NEWS_SITEMAP_CACHE_CONTROL).toContain(`s-maxage=${NEWS_SITEMAP_REVALIDATE_S}`)
  })

  it('does not store an empty urlset and serves the last valid body after a timeout', async () => {
    let now = 1_000
    let mode: 'ok' | 'empty' | 'timeout' = 'ok'
    const get = createTtlSingleCache(
      async () => {
        if (mode === 'timeout') throw new Error('news sitemap timeout')
        if (mode === 'empty') return '<urlset></urlset>'
        return '<urlset><url><loc>https://www.nahaber.com/haber/a</loc></url></urlset>'
      },
      30 * 60 * 1000,
      () => now,
      () => false,
      { serveStaleOnError: true, skipEmpty: true }
    )

    const first = await get()
    expect(first.xml).toContain('<loc>')

    mode = 'empty'
    now += 31 * 60 * 1000
    const afterEmpty = await get()
    expect(afterEmpty.xml).toContain('<loc>')

    mode = 'timeout'
    now += 31 * 60 * 1000
    const afterTimeout = await get()
    expect(afterTimeout.xml).toContain('https://www.nahaber.com/haber/a')
  })

  it('leaves a first empty body uncached so the next load can replace it', async () => {
    let now = 1_000
    const load = vi.fn(async () => '<urlset></urlset>')
    const get = createTtlSingleCache(load, 30 * 60 * 1000, () => now, () => false, {
      serveStaleOnError: true,
      skipEmpty: true,
    })
    await get()
    now += 1_000
    await get()
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('P2 cron does not fan out to a deployment host', () => {
  it('schedules one in-process tick and does not call a vercel.app URL', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>
    }
    expect(vercel.crons).toEqual([{ path: '/api/cron/crawler/tick', schedule: '*/30 * * * *' }])
    const tick = readFileSync(join(process.cwd(), 'src/app/api/cron/crawler/tick/route.ts'), 'utf8')
    const worker = readFileSync(join(process.cwd(), 'src/services/crawler/workers/tick.ts'), 'utf8')
    expect(tick).toContain('runCrawlerTick()')
    expect(tick).not.toContain('vercel.app')
    expect(tick).not.toContain('VERCEL_URL')
    expect(worker).not.toContain('vercel.app')
    expect(worker).not.toContain('VERCEL_URL')
  })
})
