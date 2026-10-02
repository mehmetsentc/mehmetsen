/**
 * SEO-9 — discoverability release (SEO-8 P0-2, P1-1, P2-1).
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sitemap/newsSitemapLoader', () => ({
  getNewsSitemapEntries: vi.fn(async () => []),
}))

import { pickLatestNewsLinks, LATEST_NEWS_LINK_LIMIT } from '@/components/category/LatestNewsLinkList'
import { isTrendBoilerplateSlug, TREND_BOILERPLATE_SLUGS } from './trendBoilerplateSlugs'
import { classifyPublicRead, canBeIndexable, type PublicReadArticleMeta } from '@/services/editorial/publicReadPolicy'
import { buildCategoriesSitemap, REDIRECTED_CATEGORY_SLUGS } from '@/lib/sitemap/entitySitemaps'
import { DEFAULT_CATEGORIES } from '@/constants/config'

function legacy(slug: string): PublicReadArticleMeta {
  return { id: 'doc_1', title: 'Başlık', status: 'published', slug, visibility: 'public' }
}

describe('pickLatestNewsLinks', () => {
  it('sorts newest first, de-dupes slugs, caps at limit', () => {
    const entries = Array.from({ length: 70 }, (_, i) => ({
      slug: `haber-${i}`,
      title: `Haber ${i}`,
      publishedMs: 1_000 + i,
    }))
    entries.push({ slug: 'haber-69', title: 'Kopya', publishedMs: 1 })
    entries.push({ slug: '', title: 'Boş slug', publishedMs: 9_999 })
    const out = pickLatestNewsLinks(entries)
    expect(out).toHaveLength(LATEST_NEWS_LINK_LIMIT)
    expect(out[0].slug).toBe('haber-69')
    expect(out[0].title).toBe('Haber 69')
    expect(new Set(out.map((e) => e.slug)).size).toBe(out.length)
  })
})

describe('T1 "neden gündemde" quarantine', () => {
  it('has the audited 432 slugs, all template slugs', () => {
    expect(TREND_BOILERPLATE_SLUGS.size).toBe(432)
    for (const s of TREND_BOILERPLATE_SLUGS) expect(s).toMatch(/neden-gundemde(-\d+)?$/)
  })

  it('T1 slug → LEGACY_QUARANTINED (noindex)', () => {
    const meta = legacy('1915-canakkale-koprusu-neden-gundemde')
    expect(isTrendBoilerplateSlug(meta.slug)).toBe(true)
    expect(classifyPublicRead(meta)).toBe('LEGACY_QUARANTINED')
    expect(canBeIndexable('LEGACY_QUARANTINED')).toBe(false)
  })

  it('other neden-gundemde and normal slugs are unaffected', () => {
    expect(classifyPublicRead(legacy('yeni-bir-konu-neden-gundemde'))).toBe('LEGACY_ALLOWED')
    expect(classifyPublicRead(legacy('normal-haber'))).toBe('LEGACY_ALLOWED')
    expect(isTrendBoilerplateSlug(undefined)).toBe(false)
  })

  it('explicit human authority still wins', () => {
    expect(
      classifyPublicRead({ ...legacy('abd-neden-gundemde'), publicationAuthority: 'HUMAN_EDITOR' })
    ).toBe('CANONICAL')
  })
})

describe('categories sitemap lists final URLs only', () => {
  it('excludes slugs that 301 elsewhere', async () => {
    const xml = await buildCategoriesSitemap('https://www.nahaber.com')
    for (const slug of REDIRECTED_CATEGORY_SLUGS) {
      expect(xml).not.toContain(`/kategori/${slug}<`)
    }
    expect(xml).toContain('/kategori/gundem<')
  })
})

describe('/son-dakika redirect', () => {
  it('301s to /kategori/son-dakika, which is a real category', async () => {
    const { default: config } = await import('../../../next.config')
    const redirects = await config.redirects!()
    const r = redirects.find((x) => x.source === '/son-dakika')
    expect(r).toMatchObject({ destination: '/kategori/son-dakika', permanent: true })
    expect(DEFAULT_CATEGORIES.some((c) => (c.slug ?? c.id) === 'son-dakika')).toBe(true)
  })
})
