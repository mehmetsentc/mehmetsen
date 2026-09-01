import { describe, expect, it } from 'vitest'
import { buildEditorialTiers, categoryLabelFor, formatPublishedAt } from './editorialTiers'
import type { PublisherArticleItem } from '@/types/publisher'

function art(id: string, opts: Partial<PublisherArticleItem> & { daysAgo: number; categoryId?: string }): PublisherArticleItem {
  const publishedAt = new Date(Date.now() - opts.daysAgo * 86_400_000)
  return {
    id,
    slug: id,
    title: `Article ${id}`,
    summary: null,
    thumbnailUrl: null,
    publishedAt,
    sourceId: 'src_1',
    categoryId: opts.categoryId ?? 'gundem',
    ...opts,
  }
}

// Newest-first, matching the real contract from publisherService.getPublisherArticles.
function sortedByDaysAgo(items: PublisherArticleItem[]): PublisherArticleItem[] {
  return [...items].sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
}

const categoryMap = new Map<string, string>([
  ['gundem', 'Gündem'],
  ['spor', 'Spor'],
  ['ekonomi', 'Ekonomi'],
])

describe('buildEditorialTiers', () => {
  it('returns all-empty tiers for zero articles (LP7 Task 10: truthful empty state)', () => {
    const tiers = buildEditorialTiers([], categoryMap)
    expect(tiers).toEqual({ lead: null, secondary: [], sections: [], latest: [] })
  })

  it('a single article becomes only the lead — no secondary/sections/latest are invented', () => {
    const only = art('a1', { daysAgo: 0 })
    const tiers = buildEditorialTiers([only], categoryMap)
    expect(tiers.lead?.id).toBe('a1')
    expect(tiers.secondary).toEqual([])
    expect(tiers.sections).toEqual([])
    expect(tiers.latest).toEqual([])
  })

  it('2-4 articles: lead + secondary only, nothing left over for sections/latest', () => {
    const items = sortedByDaysAgo([
      art('a1', { daysAgo: 0 }),
      art('a2', { daysAgo: 1 }),
      art('a3', { daysAgo: 2 }),
    ])
    const tiers = buildEditorialTiers(items, categoryMap)
    expect(tiers.lead?.id).toBe('a1')
    expect(tiers.secondary.map((a) => a.id)).toEqual(['a2', 'a3'])
    expect(tiers.sections).toEqual([])
    expect(tiers.latest).toEqual([])
  })

  it('caps secondary at 4 and puts the rest in the pool (sections/latest)', () => {
    const items = sortedByDaysAgo(
      Array.from({ length: 8 }, (_, i) => art(`a${i}`, { daysAgo: i, categoryId: 'gundem' }))
    )
    const tiers = buildEditorialTiers(items, categoryMap)
    expect(tiers.secondary).toHaveLength(4)
    // lead(1) + secondary(4) + pool(3) = 8, pool has < 2 per category threshold met (gundem has 3)
    expect(tiers.latest.length + tiers.sections.reduce((n, s) => n + s.items.length, 0)).toBeGreaterThan(0)
  })

  it('a category needs >=2 remaining articles to earn its own section; a lone one folds into latest', () => {
    const items = sortedByDaysAgo([
      art('lead', { daysAgo: 0, categoryId: 'gundem' }),
      art('s1', { daysAgo: 1, categoryId: 'gundem' }),
      art('s2', { daysAgo: 2, categoryId: 'gundem' }),
      art('s3', { daysAgo: 3, categoryId: 'gundem' }),
      art('s4', { daysAgo: 4, categoryId: 'gundem' }),
      // pool: sp1, sp2 (spor, 2 articles -> earns a section), eco1 (ekonomi, 1 article -> folds to latest)
      art('sp1', { daysAgo: 5, categoryId: 'spor' }),
      art('sp2', { daysAgo: 6, categoryId: 'spor' }),
      art('eco1', { daysAgo: 7, categoryId: 'ekonomi' }),
    ])
    const tiers = buildEditorialTiers(items, categoryMap)
    expect(tiers.lead?.id).toBe('lead')
    expect(tiers.secondary.map((a) => a.id)).toEqual(['s1', 's2', 's3', 's4'])
    expect(tiers.sections).toHaveLength(1)
    expect(tiers.sections[0].id).toBe('spor')
    expect(tiers.sections[0].items.map((a) => a.id)).toEqual(['sp1', 'sp2'])
    // eco1 has no section (only 1 article in category) — it must still appear, in latest.
    expect(tiers.latest.map((a) => a.id)).toContain('eco1')
  })

  it('never drops an article: lead + secondary + latest + section items always account for every input (sections may overlap latest by design)', () => {
    const items = sortedByDaysAgo(
      Array.from({ length: 12 }, (_, i) => art(`a${i}`, { daysAgo: i, categoryId: i % 3 === 0 ? 'spor' : 'gundem' }))
    )
    const tiers = buildEditorialTiers(items, categoryMap)
    const accounted = new Set<string>()
    if (tiers.lead) accounted.add(tiers.lead.id)
    tiers.secondary.forEach((a) => accounted.add(a.id))
    tiers.latest.forEach((a) => accounted.add(a.id))
    tiers.sections.forEach((s) => s.items.forEach((a) => accounted.add(a.id)))
    for (const item of items) {
      expect(accounted.has(item.id)).toBe(true)
    }
  })
})

describe('categoryLabelFor', () => {
  it('resolves a known category id to its localized label', () => {
    expect(categoryLabelFor({ categoryId: 'spor' }, categoryMap)).toBe('Spor')
  })

  it('falls back to an uppercased raw id for an unknown category', () => {
    expect(categoryLabelFor({ categoryId: 'teknoloji' }, categoryMap)).toBe('TEKNOLOJI')
  })

  it('falls back to GÜNDEM when categoryId is missing', () => {
    expect(categoryLabelFor({ categoryId: null }, categoryMap)).toBe('GÜNDEM')
  })
})

describe('formatPublishedAt', () => {
  it('returns empty string for a null date rather than throwing or showing "Invalid Date"', () => {
    expect(formatPublishedAt(null)).toBe('')
  })

  it('formats a real date in tr-TR style', () => {
    const formatted = formatPublishedAt(new Date('2026-03-15T10:00:00Z'))
    expect(formatted.length).toBeGreaterThan(0)
    expect(formatted).not.toMatch(/invalid/i)
  })
})
