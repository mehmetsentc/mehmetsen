'use client'

import { CategoryRail } from '@/components/home/CategoryRail'
import { LazySection } from '@/components/home/LazySection'
import { useMergedCategoryRails } from '@/hooks/useMergedCategoryRails'
import { getCategoryLabel } from '@/lib/newsMapper'
import {
  HOME_CATEGORY_RAILS,
  type HomeCategorySlug,
  type NewsItem,
} from '@/types/newsItem'

interface LazyCategoryRailsProps {
  initialRails: Partial<Record<HomeCategorySlug, NewsItem[]>>
  /** When set, only render rails for these categories (city tenants). */
  categoryIds?: readonly HomeCategorySlug[]
}

/**
 * SSR rayları hemen; kalan kategoriler kısa gecikmeyle tek pool-cached API çağrısıyla.
 */
export function LazyCategoryRails({ initialRails, categoryIds }: LazyCategoryRailsProps) {
  const ensureCategories = categoryIds ?? HOME_CATEGORY_RAILS
  const merged = useMergedCategoryRails(initialRails, ensureCategories, categoryIds ? 0 : 2500)

  return (
    <>
      {ensureCategories.map((categoryId) => {
        const items = merged[categoryId]
        if (!items?.length) return null
        return (
          <LazySection key={categoryId} minHeight={260}>
            <CategoryRail
              categoryId={categoryId}
              title={getCategoryLabel(categoryId)}
              items={items}
            />
          </LazySection>
        )
      })}
    </>
  )
}
