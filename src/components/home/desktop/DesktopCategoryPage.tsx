'use client'

import { useMemo } from 'react'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopInsideIndex } from '@/components/home/desktop/DesktopInsideIndex'
import { CategoryLoadMore, categoryBeforeDayFromItems } from '@/components/category/CategoryLoadMore'
import { CategoryBbcPageHeader } from '@/components/category/CategoryBbcPageHeader'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import type { CategoryDef } from '@/constants/config'
import type { TimelinePost } from '@/types/post'
import type { NewsItem } from '@/types/newsItem'

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

function toNewsItem(post: TimelinePost): NewsItem {
  const pubMs =
    typeof post.publishedAt === 'number'
      ? post.publishedAt
      : post.publishedAt
        ? Date.parse(String(post.publishedAt))
        : null
  return {
    id: post.id,
    slug: post.slug ?? post.id,
    title: post.title ?? '',
    description: post.spot?.trim().slice(0, 120) || undefined,
    imageUrl: post.coverImageUrl ?? undefined,
    publishedAt: pubMs ? new Date(pubMs).toISOString() : undefined,
    category: post.categoryId ?? undefined,
    breaking: post.isBreaking ?? false,
  }
}

/**
 * Desktop category page — client-side Firestore kaldırıldı.
 * CategoryExperience + useThemedCategoryFeed yerine CategoryLoadMore kullanılır.
 * Load more, /api/feed/category (5 dk ISR) üzerinden sunucu tarafı çalışır.
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

  const items: NewsItem[] = useMemo(() => initialPosts.map(toNewsItem), [initialPosts])
  const initialBeforeDay = categoryBeforeDayFromItems(items)

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

          <CategoryLoadMore
            categoryId={cat.id}
            initialItems={items}
            initialBeforeDay={initialBeforeDay}
            initialHasMore
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
