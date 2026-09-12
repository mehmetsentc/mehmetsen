import type { PublisherArticleItem } from '@/types/publisher'

/**
 * LP7R.1 — publisher-newspaper editorial composition helpers.
 * Pure, framework-free data transforms (no React/Next imports) so they can
 * be unit-tested directly — see editorialTiers.test.ts.
 *
 * Reconciled with the current (post-6031c59/89cfa28) pagination architecture:
 * Lead/Secondary/Sections are computed ONCE from the initial server-rendered
 * article page (stable — does not reshuffle as more pages load via cursor),
 * and Latest is whatever remains from the full, growing, currently-loaded
 * article list, so a story never appears twice and "load more" only ever
 * grows Latest.
 */

export function formatPublishedAt(date: Date | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function categoryLabelFor(
  article: Pick<PublisherArticleItem, 'categoryId'>,
  categoryMap: Map<string, string>
): string {
  return (
    categoryMap.get((article.categoryId || '').toLowerCase()) ||
    (article.categoryId ? article.categoryId.toUpperCase() : 'GÜNDEM')
  )
}

export interface EditorialSection {
  id: string
  label: string
  items: PublisherArticleItem[]
}

export interface EditorialFrontPage {
  lead: PublisherArticleItem | null
  secondary: PublisherArticleItem[]
  sections: EditorialSection[]
  usedIds: Set<string>
}

/**
 * LEAD (1) / SECONDARY (up to 4) / SECTIONS (real categories with >=2
 * remaining articles among the initial page, up to 4 sections of up to 4
 * items each). `initialArticles` must already be sorted newest-first
 * (guaranteed by publisherService.getPublisherArticles) and should be the
 * STABLE initial server-rendered page, not the ever-growing loaded-so-far
 * list — otherwise Lead/Secondary would reshuffle every time "load more" is
 * pressed.
 *
 * Performs no provenance filtering — every article here was already
 * verified as this publisher's own/primary content upstream (see
 * publisherRepository.resolvePublishedArticles / provenance.ts); this is
 * purely presentational slicing.
 */
export function buildEditorialFrontPage(
  initialArticles: PublisherArticleItem[],
  categoryMap: Map<string, string>
): EditorialFrontPage {
  if (initialArticles.length === 0) {
    return { lead: null, secondary: [], sections: [], usedIds: new Set() }
  }

  const lead = initialArticles[0]
  const secondary = initialArticles.slice(1, 5) // up to 4
  const usedIds = new Set<string>([lead.id, ...secondary.map((a) => a.id)])
  const pool = initialArticles.filter((a) => !usedIds.has(a.id))

  // Sections: real categories present in the remaining initial-page pool,
  // at least 2 articles each (a lone article doesn't earn its own section —
  // it folds into Latest instead).
  const byCategory = new Map<string, PublisherArticleItem[]>()
  for (const a of pool) {
    const key = (a.categoryId || 'gundem').toLowerCase().trim()
    const list = byCategory.get(key) ?? []
    list.push(a)
    byCategory.set(key, list)
  }
  const sections = [...byCategory.entries()]
    .filter(([, items]) => items.length >= 2)
    .map(([id, items]) => ({
      id,
      label: categoryMap.get(id) || id.charAt(0).toUpperCase() + id.slice(1),
      items: items.slice(0, 4),
    }))
    .sort((a, b) => {
      const am = a.items[0]?.publishedAt?.getTime() ?? 0
      const bm = b.items[0]?.publishedAt?.getTime() ?? 0
      return bm - am
    })
    .slice(0, 4)

  for (const section of sections) {
    for (const item of section.items) usedIds.add(item.id)
  }

  return { lead, secondary, sections, usedIds }
}

/**
 * Latest = everything from the full, currently-loaded (possibly
 * paginated-in) article list that wasn't already placed in Lead/Secondary/
 * Sections. Order is preserved (callers pass newest-first lists), so this
 * stays a simple reverse-chronological "rest of the paper" rail that grows
 * as more pages are fetched via cursor pagination.
 */
export function pickLatest(
  allLoadedArticles: PublisherArticleItem[],
  usedIds: Set<string>
): PublisherArticleItem[] {
  return allLoadedArticles.filter((a) => !usedIds.has(a.id))
}
