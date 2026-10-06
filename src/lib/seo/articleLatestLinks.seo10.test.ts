import { describe, expect, it } from 'vitest'
import { pickArticleLatestLinks, ARTICLE_LATEST_LINK_LIMIT } from './articleLatestLinks'
import { ARTICLE_SITEMAP_FIRESTORE_FIELDS } from '@/lib/sitemap/articleSitemap'
import type { NewsSitemapEntry } from '@/lib/sitemap/newsSitemap'

const e = (slug: string, ms: number, categoryId?: string): NewsSitemapEntry => ({
  slug,
  title: `T ${slug}`,
  publishedMs: ms,
  ...(categoryId ? { categoryId } : {}),
})

describe('SEO-10 pickArticleLatestLinks', () => {
  const entries = [
    e('spor-1', 10, 'spor'),
    e('gundem-1', 50, 'gundem'),
    e('spor-2', 40, 'spor'),
    e('eko-1', 60, 'ekonomi'),
    e('gundem-2', 30, 'gundem'),
    e('spor-3', 20, 'spor'),
    e('eski', 5),
    e('dunya-1', 70, 'dunya'),
  ]

  it('same category first (newest first), then newest overall, capped', () => {
    const out = pickArticleLatestLinks(entries, { categoryId: 'spor', excludeSlugs: ['spor-2'] })
    expect(out.map((l) => l.slug)).toEqual(['spor-3', 'spor-1', 'dunya-1', 'eko-1', 'gundem-1', 'gundem-2'])
    expect(out).toHaveLength(ARTICLE_LATEST_LINK_LIMIT)
  })

  it('works on cached entries without categoryId (newest overall)', () => {
    const legacy = entries.map(({ categoryId: _c, ...rest }) => rest)
    const out = pickArticleLatestLinks(legacy, { categoryId: 'spor', limit: 3 })
    expect(out.map((l) => l.slug)).toEqual(['dunya-1', 'eko-1', 'gundem-1'])
  })

  it('never links the article to itself and returns [] for empty input', () => {
    expect(pickArticleLatestLinks(entries, { excludeSlugs: ['dunya-1'] }).map((l) => l.slug)).not.toContain('dunya-1')
    expect(pickArticleLatestLinks([], { categoryId: 'spor' })).toEqual([])
  })

  it('sitemap projection includes categoryId (no extra document reads)', () => {
    expect(ARTICLE_SITEMAP_FIRESTORE_FIELDS).toContain('categoryId')
  })
})
