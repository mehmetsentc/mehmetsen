'use client'

import { useMemo } from 'react'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopInsideIndex } from '@/components/home/desktop/DesktopInsideIndex'
import { DesktopMoreList } from '@/components/home/desktop/DesktopMoreList'
import { CategoryBbcPageHeader } from '@/components/category/CategoryBbcPageHeader'
import { CategoryBbcSection } from '@/components/category/CategoryBbcSection'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { useCategoryDayLoadMore } from '@/hooks/useCategoryDayLoadMore'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { getCategoryAccent } from '@/constants/categoryTheme'
import { ROUTES } from '@/constants/routes'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import type { CategoryDef } from '@/constants/config'
import type { TimelinePost } from '@/types/post'

interface SubTab {
  id: string
  slug: string
  name: string
  color: string
  href: string
  active: boolean
}

interface DesktopCategoryPageProps {
  cat: CategoryDef
  headerCat: CategoryDef
  isSubcategory: boolean
  parentCat: CategoryDef | null
  subTabs: SubTab[]
  tabParent: CategoryDef | null
  initialPosts: TimelinePost[]
  topSlot?: React.ReactNode
  showFeed?: boolean
  pageTitle?: string
  showTabs?: boolean
}

/**
 * Desktop category — BBC newspaper layout for SSR posts;
 * day-based “Daha fazla yükle” only appends archive rows at the bottom.
 */
export function DesktopCategoryPage({
  cat,
  isSubcategory,
  parentCat,
  subTabs,
  tabParent,
  initialPosts,
  topSlot,
  showFeed = true,
  pageTitle: pageTitleProp,
  showTabs = false,
}: DesktopCategoryPageProps) {
  useScrollHeaderConfig({ subcategories: subTabs, tabParent })

  const pageTitle =
    pageTitleProp ??
    (isSubcategory && parentCat ? `${parentCat.name} · ${cat.name}` : cat.name)

  const last = initialPosts[initialPosts.length - 1]
  const initialBeforeDay = previousTurkeyDayFromPublishedAt(
    last?.publishedAt == null
      ? undefined
      : typeof last.publishedAt === 'number'
        ? last.publishedAt
        : String(last.publishedAt)
  )

  const excludeIds = useMemo(() => initialPosts.map((p) => p.id), [initialPosts])
  const { extraItems, hasMore, loadingMore, loadMore } = useCategoryDayLoadMore({
    categoryId: cat.id,
    initialBeforeDay,
    initialHasMore: initialPosts.length > 0,
    excludeIds,
  })

  const accentRgb = getCategoryAccent(cat.id).rgb
  const href = ROUTES.CATEGORY(cat.slug ?? cat.id)

  return (
    <div className="desktop-category-page bbc-category-page desktop-newspaper-shell w-full pb-10">
      <CategoryBbcPageHeader
        pageTitle={pageTitle}
        subTabs={showTabs ? subTabs : []}
        tabParentSlug={tabParent?.slug}
        isSubcategory={isSubcategory}
        categoryId={cat.id}
        className="mb-8"
      />

      {topSlot ? <div className="bbc-category-top-slot mb-8">{topSlot}</div> : null}

      {showFeed ? (
        <>
          <DesktopAdBanner slot={`category-${cat.id}-top`} size="large" className="mb-8" />

          <CategoryBbcSection
            title={pageTitle}
            href={href}
            posts={initialPosts}
            showHeader={false}
            isFirstSection
            loading={false}
            loadingMore={loadingMore && extraItems.length === 0}
            accentRgb={accentRgb}
          />

          {extraItems.length > 0 ? (
            <DesktopMoreList
              newsItems={extraItems}
              title="Daha fazla"
              href={href}
              loadingMore={loadingMore}
            />
          ) : null}

          {hasMore ? (
            <LoadMoreDayButton onClick={loadMore} loading={loadingMore} />
          ) : null}

          <DesktopAdBanner slot={`category-${cat.id}-bottom`} size="large" className="mb-10" />

          <div className="mt-8 max-w-md">
            <DesktopInsideIndex title="İçindekiler" />
          </div>
        </>
      ) : null}
    </div>
  )
}
