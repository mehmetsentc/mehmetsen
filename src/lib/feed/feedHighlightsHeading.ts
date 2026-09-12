/**
 * Category-aware Feed "Öne Çıkanlar" heading — taxonomy-backed, no second map.
 * Safe Turkish locatives for known labels; otherwise "{Label} · Öne Çıkanlar".
 */
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { resolveFeedV2TabForArticleCategory } from '@/lib/feed/feedV2Tabs'

/** Known safe locative headings (product examples). Keys = taxonomy ids / aliases. */
const SAFE_LOCATIVE_HEADINGS: Record<string, string> = {
  spor: 'Sporda Öne Çıkanlar',
  futbol: 'Sporda Öne Çıkanlar',
  basketbol: 'Sporda Öne Çıkanlar',
  teknoloji: 'Teknolojide Öne Çıkanlar',
  bilim: 'Teknolojide Öne Çıkanlar',
  saglik: 'Sağlıkta Öne Çıkanlar',
  yerel: 'Yerel Yaşamda Öne Çıkanlar',
  'yerel-haber': 'Yerel Yaşamda Öne Çıkanlar',
  'yerel-yasam': 'Yerel Yaşamda Öne Çıkanlar',
  ekonomi: 'Ekonomide Öne Çıkanlar',
  gundem: 'Gündemde Öne Çıkanlar',
  siyaset: 'Siyasette Öne Çıkanlar',
  dunya: 'Dünyada Öne Çıkanlar',
  kultur: 'Kültürde Öne Çıkanlar',
  magazin: 'Magazinde Öne Çıkanlar',
  gastronomi: 'Gastronomide Öne Çıkanlar',
  'son-dakika': 'Son Dakikada Öne Çıkanlar',
}

export function resolveFeedHighlightsCategoryLabel(
  category: string | null | undefined
): string | null {
  if (!category?.trim()) return null
  const key = category.trim().toLowerCase()
  const def = DEFAULT_CATEGORIES.find((c) => c.id === key || c.slug === key)
  if (def?.name) return def.name
  const tab = resolveFeedV2TabForArticleCategory(key)
  if (tab?.label) return tab.label
  return null
}

/**
 * Dynamic Feed highlights heading.
 * Prefer safe locative forms; never invent fragile grammar for unknown labels.
 */
export function formatFeedHighlightsHeading(category: string | null | undefined): string {
  if (!category?.trim()) return 'Öne Çıkanlar'
  const key = category.trim().toLowerCase()
  if (SAFE_LOCATIVE_HEADINGS[key]) return SAFE_LOCATIVE_HEADINGS[key]

  // Walk parent for yerel-* children using taxonomy parentId.
  const def = DEFAULT_CATEGORIES.find((c) => c.id === key || c.slug === key)
  if (def?.parentId && SAFE_LOCATIVE_HEADINGS[def.parentId]) {
    return SAFE_LOCATIVE_HEADINGS[def.parentId]
  }
  if (key.startsWith('yerel') && SAFE_LOCATIVE_HEADINGS.yerel) {
    return SAFE_LOCATIVE_HEADINGS.yerel
  }

  const label = resolveFeedHighlightsCategoryLabel(category)
  if (!label) return 'Öne Çıkanlar'
  return `${label} · Öne Çıkanlar`
}
