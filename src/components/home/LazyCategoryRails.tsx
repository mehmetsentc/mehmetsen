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
}

/**
 * SSR rayları hemen; kalan kategoriler kısa gecikmeyle tek pool-cached API çağrısıyla.
 */
export function LazyCategoryRails({ initialRails }: LazyCategoryRailsProps) {
  const merged = useMergedCategoryRails(initialRails, HOME_CATEGORY_RAILS)

  return (
    <>
      {HOME_CATEGORY_RAILS.map((categoryId) => {
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
