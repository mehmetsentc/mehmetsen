'use client'

import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopInsideIndex } from '@/components/home/desktop/DesktopInsideIndex'
import { CategoryExperience } from '@/components/experience/CategoryExperience'
import { CategoryBbcPageHeader } from '@/components/category/CategoryBbcPageHeader'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { getCache } from '@/lib/clientCache'
import { PAGE_CACHE_KEYS } from '@/lib/pageCache'
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

  const cacheKey = PAGE_CACHE_KEYS.category(cat.id)
  const cachedPosts = initialPosts.length ? initialPosts : (getCache<TimelinePost[]>(cacheKey) ?? [])

  const pageTitle =
    pageTitleProp ??
    (isSubcategory && parentCat ? `${parentCat.name} · ${cat.name}` : cat.name)

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

          <CategoryExperience
            categoryId={cat.id}
            initialPosts={cachedPosts}
            breakpoint="desktop"
            className="nl-category-experience"
          />

          <DesktopAdBanner slot={`category-${cat.id}-bottom`} size="large" className="mb-10" />

          <div className="mt-8 max-w-md">
            <DesktopInsideIndex title="İçindekiler" />
          </div>
        </>
      ) : null}
    </div>
  )
}
