'use client'

import { useMemo } from 'react'
import { categoryPostImage } from '@/components/home/desktop/categoryPostUtils'
import { FEATURED_CAROUSEL_LIMIT } from '@/types/newsItem'
import { CategoryHeroCarousel } from '@/components/category/CategoryHeroCarousel'
import { MobileFeedCard } from '@/components/feed/MobileFeedCard'
import { MobileCategoryHeader } from './MobileCategoryHeader'
import { MobileYerelCityStrip } from './MobileYerelCityStrip'
import { CategoryLoadMore } from '@/components/category/CategoryLoadMore'
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
 * Mobile-only (<768px) category landing — SonDakika-style feed.
 *
 * Hero carousel at top (kept), followed by full-width vertical cards
 * matching the SonDakika.com feed pattern.
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
  const heroCarouselPosts = useMemo(() => {
    const withImage = initialPosts.filter((p) => categoryPostImage(p).length > 10)
    const pool = withImage.length > 0 ? withImage : initialPosts
    const featured = pool.filter((p) => p.featured === true || p.isEditorPick === true)
    const ordered =
      featured.length > 0
        ? [...featured, ...pool.filter((p) => !featured.some((f) => f.id === p.id))]
        : pool
    return ordered.slice(0, FEATURED_CAROUSEL_LIMIT)
  }, [initialPosts])

  const heroIds = useMemo(
    () => new Set(heroCarouselPosts.map((p) => p.id)),
    [heroCarouselPosts]
  )

  const feedPosts = useMemo(
    () => initialPosts.filter((p) => !heroIds.has(p.id)),
    [initialPosts, heroIds]
  )

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
    <div className="mc-page">
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

      {heroCarouselPosts.length > 0 ? (
        <div className="mc-hero-carousel px-0">
          <CategoryHeroCarousel
            posts={heroCarouselPosts}
            priority
            limit={FEATURED_CAROUSEL_LIMIT}
          />
        </div>
      ) : null}

      {feedPosts.length > 0 ? (
        <div className="sd-feed mt-2">
          {feedPosts.map((post, i) => (
            <MobileFeedCard key={post.id} post={post} priority={i === 0 && heroCarouselPosts.length === 0} />
          ))}
        </div>
      ) : null}

      <div className="px-3 pt-2 pb-8">
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
