/**
 * FinOps 22 Oct — month sitemap scans are shared per instance (memo + in-flight).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/db', () => ({ getDb: vi.fn(), hasDatabaseUrl: vi.fn(() => false) }))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: vi.fn() }))

import {
  __resetArticleMonthMemoForTests,
  ARTICLE_MONTH_MEMO_CURRENT_MS,
  getArticleMonth,
} from '@/lib/sitemap/articleSitemap'
import type { ArticleSitemapMonth } from '@/lib/sitemap/articleSitemapEntries'

const NOW = Date.UTC(2026, 9, 22, 12)
const month = (m: string, n: number): ArticleSitemapMonth => ({
  month: m as ArticleSitemapMonth['month'],
  entries: Array.from({ length: n }, (_, i) => [`slug-${i}`, 1] as [string, number]),
})

describe('getArticleMonth memo (finops)', () => {
  beforeEach(() => __resetArticleMonthMemoForTests())

  it('shares one load across concurrent callers and reuses it within the TTL', async () => {
    const load = vi.fn(async (m: string) => month(m, 3))
    const [a, b] = await Promise.all([
      getArticleMonth('2026-09', NOW, load),
      getArticleMonth('2026-09', NOW, load),
    ])
    expect(a).toBe(b)
    await getArticleMonth('2026-09', NOW + 60_000, load)
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('2026-09', true)
  })

  it('reloads the current month after its TTL and keeps months separate', async () => {
    const load = vi.fn(async (m: string) => month(m, 2))
    await getArticleMonth('2026-10', NOW, load)
    await getArticleMonth('2026-08', NOW, load)
    expect(load).toHaveBeenCalledTimes(2)
    await getArticleMonth('2026-10', Date.now() + ARTICLE_MONTH_MEMO_CURRENT_MS + 1, load)
    expect(load).toHaveBeenCalledTimes(3)
    expect(load).toHaveBeenNthCalledWith(1, '2026-10', false)
  })

  it('never pins errors or empty months', async () => {
    const load = vi
      .fn<(m: string) => Promise<ArticleSitemapMonth>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(month('2026-07', 0))
      .mockResolvedValueOnce(month('2026-07', 1))
    await expect(getArticleMonth('2026-07', NOW, load)).rejects.toThrow('down')
    expect((await getArticleMonth('2026-07', NOW, load)).entries).toHaveLength(0)
    expect((await getArticleMonth('2026-07', NOW, load)).entries).toHaveLength(1)
    expect(load).toHaveBeenCalledTimes(3)
  })
})
