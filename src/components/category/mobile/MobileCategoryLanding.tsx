'use client'

import { useMemo } from 'react'
import { MobileCategoryHeader } from './MobileCategoryHeader'
import { MobileYerelCityStrip } from './MobileYerelCityStrip'
import { CategoryLoadMore } from '@/components/category/CategoryLoadMore'
import { SourceStories } from '@/components/home/SourceStories'
import { MagazineNewsList } from '@/components/home/MagazineNewsList'
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

interface MobileCategoryLandingProps {
  cat: CategoryDef
  isSubcategory: boolean
  parentCat: CategoryDef | null
  subTabs: SubTab[]
  tabParent: CategoryDef | null
  showTabs: boolean
  initialPosts: TimelinePost[]
  pageTitle: string
  topExtras?: React.ReactNode
}

/**
 * Category landing — same magazine + source-story language as Ana Sayfa.
 * Does not apply to Akış (/feed-v2).
 */
export function MobileCategoryLanding({
  cat,
  isSubcategory,
  parentCat,
  subTabs,
  tabParent,
  showTabs,
  initialPosts,
  pageTitle,
  topExtras,
}: MobileCategoryLandingProps) {
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

  const empty = initialPosts.length === 0

  return (
    <div className="mc-page home-feed home-feed--magazine" data-testid="category-magazine-feed">
      <MobileCategoryHeader
        pageTitle={isSubcategory && parentCat ? cat.name : pageTitle.includes('·') ? cat.name : pageTitle}
        categoryId={cat.id}
        isSubcategory={isSubcategory}
        parentName={parentCat?.name}
        parentSlug={parentCat?.slug}
        subTabs={showTabs ? subTabs : []}
        tabParentSlug={tabParent?.slug}
      />

      {topExtras ? <div className="mc-extras">{topExtras}</div> : null}

      {cat.id === 'yerel-haber' ? <MobileYerelCityStrip /> : null}

      {empty ? (
        <p className="mc-empty">Bu kategoride henüz yayınlanmış haber bulunmuyor.</p>
      ) : null}

      <SourceStories groups={storyGroups} />

      {newsItems.length > 0 ? (
        <MagazineNewsList items={newsItems} priorityCount={Math.min(2, newsItems.length)} />
      ) : null}

      <div className="pt-2 pb-8">
        <CategoryLoadMore
          categoryId={cat.id}
          initialItems={newsItems}
          initialBeforeDay={initialBeforeDay}
          initialHasMore={initialPosts.length > 0}
        />
      </div>
    </div>
  )
}
