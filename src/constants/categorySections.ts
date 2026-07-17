import { DEFAULT_CATEGORIES, getSubcategories, type CategoryDef } from '@/constants/config'
import { ROUTES } from '@/constants/routes'

/**
 * Özel sıralama gereken üst kategoriler.
 * Diğer tüm kategoriler DEFAULT_CATEGORIES sırasıyla otomatik bölümlenir.
 */
const CUSTOM_SECTION_ORDER: Partial<Record<string, readonly string[]>> = {
  spor: [
    'dunya-kupasi-2026',
    'futbol',
    'basketbol',
    'voleybol',
    'gures',
    'hentbol',
    'atletizm',
    'spor',
  ],
  kultur: ['sinema', 'tiyatro', 'konser', 'festival', 'kultur'],
  ekonomi: ['borsa', 'kripto', 'finans-piyasa', 'emlak-konut', 'enerji', 'is-kariyer', 'ekonomi'],
  yasam: ['astroloji', 'moda', 'anne-cocuk', 'dekorasyon', 'iliskiler', 'yasam'],
}

/** Tüm kategori sayfaları temalı lazy-load akışını kullanır. */
export function hasThemedCategorySections(_categoryId: string): boolean {
  return true
}

/**
 * Kategori sayfasında sırayla gösterilecek bölüm id'leri.
 * - Üst kategori + alt kategoriler: altlar önce, genel kategori sonda
 * - Tekil kategori: tek bölüm
 */
export function getThemedCategorySectionIds(categoryId: string): string[] {
  const custom = CUSTOM_SECTION_ORDER[categoryId]
  if (custom) return [...custom]

  const subs = getSubcategories(categoryId)
  if (subs.length > 0) {
    return [...subs.map((s) => s.id), categoryId]
  }

  return [categoryId]
}

export function getCategorySectionDef(sectionId: string): CategoryDef | undefined {
  return DEFAULT_CATEGORIES.find((c) => c.id === sectionId)
}

export function getCategorySectionHref(sectionId: string): string {
  const def = getCategorySectionDef(sectionId)
  return def ? ROUTES.CATEGORY(def.slug ?? def.id) : ROUTES.FEED
}

export function getScrollSectionParent(categoryId: string): string | null {
  const cat = DEFAULT_CATEGORIES.find((c) => c.id === categoryId)
  if (!cat) return null
  if (!cat.parentId) return categoryId
  return cat.parentId
}

export function getSubTabsForParent(parentId: string) {
  return getSubcategories(parentId).map((sub) => ({
    id: sub.id,
    slug: sub.slug,
    name: sub.name,
    color: sub.color,
    href: ROUTES.CATEGORY(sub.slug ?? sub.id),
  }))
}
