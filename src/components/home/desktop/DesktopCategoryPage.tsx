'use client'

import { useMemo } from 'react'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopInsideIndex } from '@/components/home/desktop/DesktopInsideIndex'
import { CategoryBbcPageHeader } from '@/components/category/CategoryBbcPageHeader'
import { CategoryLoadMore } from '@/components/category/CategoryLoadMore'
import { SourceStories } from '@/components/home/SourceStories'
import { MagazineNewsList } from '@/components/home/MagazineNewsList'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { groupNewsBySource } from '@/lib/home/sourceStories'
import { timelinePostToNewsItem } from '@/lib/newsItemToTimelinePost'
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
  visibleSectionIds?: string[]
}

/**
 * Desktop category — same magazine + source-story language as Ana Sayfa.
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

  const newsItems = useMemo(
    () => initialPosts.map(timelinePostToNewsItem),
    [initialPosts]
  )
  const storyGroups = useMemo(() => groupNewsBySource(newsItems), [newsItems])
  const lastPost = initialPosts[initialPosts.length - 1]
  const initialBeforeDay = previousTurkeyDayFromPublishedAt(
    lastPost?.publishedAt == null
      ? undefined
      : typeof lastPost.publishedAt === 'number'
        ? lastPost.publishedAt
        : String(lastPost.publishedAt)
  )

  return (
    <div
      className="desktop-category-page bbc-category-page desktop-newspaper-shell home-feed--magazine w-full pb-10"
      data-testid="category-magazine-feed-desktop"
    >
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

          <SourceStories groups={storyGroups} />
          {newsItems.length > 0 ? (
            <MagazineNewsList items={newsItems} priorityCount={Math.min(2, newsItems.length)} />
          ) : null}
          <CategoryLoadMore
            categoryId={cat.id}
            initialItems={newsItems}
            initialBeforeDay={initialBeforeDay}
            initialHasMore={initialPosts.length > 0}
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
