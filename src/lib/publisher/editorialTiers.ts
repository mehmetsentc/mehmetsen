import type { PublisherArticleItem } from '@/types/publisher'

/**
 * LP7 Task 3/4/6/7 — publisher-newspaper editorial composition helpers.
 * Pure, framework-free data transforms (no React/Next imports) so they can
 * be unit-tested directly — see editorialTiers.test.ts.
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

export interface EditorialTiers {
  lead: PublisherArticleItem | null
  secondary: PublisherArticleItem[]
  sections: EditorialSection[]
  latest: PublisherArticleItem[]
}

/**
 * Editorial composition tiers for the publisher-newspaper front page
 * ("Tümü" view): LEAD (1) / SECONDARY (up to 4) / SECTIONS (real categories
 * with >=2 remaining articles, up to 4 sections of up to 4 items each) /
 * LATEST (everything else, reverse-chronological).
 *
 * `articles` must already be sorted newest-first (guaranteed today by
 * publisherService.getPublisherArticles). This function performs no
 * provenance filtering — every article it places was already verified as
 * this publisher's own/primary content upstream (LP7 Task 2's query rule);
 * this is purely presentational slicing.
 */
export function buildEditorialTiers(
  articles: PublisherArticleItem[],
  categoryMap: Map<string, string>
): EditorialTiers {
  if (articles.length === 0) {
    return { lead: null, secondary: [], sections: [], latest: [] }
  }

  const lead = articles[0]
  const secondary = articles.slice(1, 5) // up to 4
  const usedIds = new Set<string>([lead.id, ...secondary.map((a) => a.id)])
  const pool = articles.filter((a) => !usedIds.has(a.id))

  // Sections: real categories present in the remaining pool, at least 2
  // articles each (a lone article doesn't earn its own section — it folds
  // into Latest instead, per LP7 Task 3 §3.3).
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
    // Freshest section (by its newest article) first.
    .sort((a, b) => {
      const am = a.items[0]?.publishedAt?.getTime() ?? 0
      const bm = b.items[0]?.publishedAt?.getTime() ?? 0
      return bm - am
    })
    .slice(0, 4)

  return { lead, secondary, sections, latest: pool }
}
