import { describe, expect, it } from 'vitest'
import { buildEditorialFrontPage, categoryLabelFor, formatPublishedAt, pickLatest } from './editorialTiers'
import type { PublisherArticleItem } from '@/types/publisher'

function art(id: string, opts: { daysAgo: number; categoryId?: string }): PublisherArticleItem {
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
  }
}

function sortedByDaysAgo(items: PublisherArticleItem[]): PublisherArticleItem[] {
  return [...items].sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
}

const categoryMap = new Map<string, string>([
  ['gundem', 'Gündem'],
  ['spor', 'Spor'],
  ['ekonomi', 'Ekonomi'],
])

describe('buildEditorialFrontPage', () => {
  it('empty input -> all-empty front page (truthful empty state)', () => {
    const fp = buildEditorialFrontPage([], categoryMap)
    expect(fp.lead).toBeNull()
    expect(fp.secondary).toEqual([])
    expect(fp.sections).toEqual([])
    expect(fp.usedIds.size).toBe(0)
  })

  it('single article becomes only the lead', () => {
    const fp = buildEditorialFrontPage([art('a1', { daysAgo: 0 })], categoryMap)
    expect(fp.lead?.id).toBe('a1')
    expect(fp.secondary).toEqual([])
    expect(fp.sections).toEqual([])
    expect(fp.usedIds).toEqual(new Set(['a1']))
  })

  it('caps secondary at 4', () => {
    const items = sortedByDaysAgo(Array.from({ length: 8 }, (_, i) => art(`a${i}`, { daysAgo: i })))
    const fp = buildEditorialFrontPage(items, categoryMap)
    expect(fp.secondary).toHaveLength(4)
  })

  it('a category needs >=2 remaining articles to earn a section; a lone one is left for Latest', () => {
    const items = sortedByDaysAgo([
      art('lead', { daysAgo: 0 }),
      art('s1', { daysAgo: 1 }),
      art('s2', { daysAgo: 2 }),
      art('s3', { daysAgo: 3 }),
      art('s4', { daysAgo: 4 }),
      art('sp1', { daysAgo: 5, categoryId: 'spor' }),
      art('sp2', { daysAgo: 6, categoryId: 'spor' }),
      art('eco1', { daysAgo: 7, categoryId: 'ekonomi' }),
    ])
    const fp = buildEditorialFrontPage(items, categoryMap)
    expect(fp.lead?.id).toBe('lead')
    expect(fp.secondary.map((a) => a.id)).toEqual(['s1', 's2', 's3', 's4'])
    expect(fp.sections).toHaveLength(1)
    expect(fp.sections[0].id).toBe('spor')
    expect(fp.sections[0].items.map((a) => a.id)).toEqual(['sp1', 'sp2'])
    // eco1 (lone ekonomi article) is NOT placed anywhere by buildEditorialFrontPage
    expect(fp.usedIds.has('eco1')).toBe(false)
  })
})

describe('pickLatest + buildEditorialFrontPage integration — no duplicates, load-more only grows Latest', () => {
  it('every initial-page article is either in lead/secondary/sections or in Latest, never both, never dropped', () => {
    const initial = sortedByDaysAgo(
      Array.from({ length: 12 }, (_, i) => art(`a${i}`, { daysAgo: i, categoryId: i % 3 === 0 ? 'spor' : 'gundem' }))
    )
    const fp = buildEditorialFrontPage(initial, categoryMap)
    const latest = pickLatest(initial, fp.usedIds)

    const placedElsewhere = new Set<string>()
    if (fp.lead) placedElsewhere.add(fp.lead.id)
    fp.secondary.forEach((a) => placedElsewhere.add(a.id))
    fp.sections.forEach((s) => s.items.forEach((a) => placedElsewhere.add(a.id)))

    for (const item of initial) {
      const inFrontPage = placedElsewhere.has(item.id)
      const inLatest = latest.some((l) => l.id === item.id)
      expect(inFrontPage || inLatest).toBe(true)
      expect(inFrontPage && inLatest).toBe(false) // never both
    }
  })

  it('loading more pages only appends to Latest — Lead/Secondary/Sections stay fixed', () => {
    const initial = sortedByDaysAgo(Array.from({ length: 7 }, (_, i) => art(`a${i}`, { daysAgo: i })))
    const fp = buildEditorialFrontPage(initial, categoryMap)
    const latestBefore = pickLatest(initial, fp.usedIds)

    // Simulate a "load more" append of two older articles via cursor pagination.
    const grown = [...initial, art('older1', { daysAgo: 20 }), art('older2', { daysAgo: 21 })]
    const latestAfter = pickLatest(grown, fp.usedIds)

    expect(latestAfter.length).toBe(latestBefore.length + 2)
    expect(latestAfter.some((a) => a.id === 'older1')).toBe(true)
    expect(latestAfter.some((a) => a.id === 'older2')).toBe(true)
    // fp itself (lead/secondary/sections) is untouched by the append — same object.
    expect(fp.lead?.id).toBe(initial[0].id)
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
  it('returns empty string for a null date', () => {
    expect(formatPublishedAt(null)).toBe('')
  })
  it('formats a real date in tr-TR style', () => {
    const formatted = formatPublishedAt(new Date('2026-03-15T10:00:00Z'))
    expect(formatted.length).toBeGreaterThan(0)
  })
})
