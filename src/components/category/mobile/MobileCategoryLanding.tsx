'use client'

import { useMemo } from 'react'
import { HOME_FEATURED_LIMIT } from '@/types/newsItem'
import { MobileCategoryHeader } from './MobileCategoryHeader'
import { MobileYerelCityStrip } from './MobileYerelCityStrip'
import { CategoryLoadMore } from '@/components/category/CategoryLoadMore'
import { HomeDiscoveryMasonry } from '@/components/home/HomeDiscoveryMasonry'
import { timelinePostToDiscovery } from '@/components/home/HomeDiscoveryCard'
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
 * Mobile category landing — same visual discovery language as Ana Sayfa.
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
  const featuredPosts = useMemo(() => {
    const featured = initialPosts.filter((p) => p.featured === true || p.isEditorPick === true)
    return featured.slice(0, HOME_FEATURED_LIMIT)
  }, [initialPosts])

  const featuredIds = useMemo(
    () => new Set(featuredPosts.map((p) => p.id)),
    [featuredPosts]
  )

  const discoveryItems = useMemo(() => {
    const rest = initialPosts.filter((p) => !featuredIds.has(p.id))
    return [...featuredPosts, ...rest].map(timelinePostToDiscovery)
  }, [initialPosts, featuredPosts, featuredIds])

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
    <div className="mc-page home-feed home-feed--discovery">
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

      {featuredPosts.length > 0 ? (
        <p className="home-discovery-label" data-testid="home-featured-label">
          Öne Çıkanlar
        </p>
      ) : null}

      {discoveryItems.length > 0 ? (
        <HomeDiscoveryMasonry
          items={discoveryItems}
          featuredCount={featuredPosts.length}
          priorityCount={Math.min(4, discoveryItems.length)}
          navSource="category"
        />
      ) : null}

      <div className="pt-2 pb-8">
        <CategoryLoadMore
          categoryId={cat.id}
          initialItems={initialPosts.map((p) => ({
            id: p.id,
            slug: p.slug ?? p.id,
            title: p.title ?? '',
          }))}
          initialBeforeDay={initialBeforeDay}
          initialHasMore={initialPosts.length > 0}
        />
      </div>
    </div>
  )
}
