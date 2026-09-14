'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopCategoryCard } from '@/components/home/desktop/DesktopCategoryCard'
import { DesktopCategoryHero } from '@/components/home/desktop/DesktopCategoryHero'
import { CategoryLoadMore } from '@/components/category/CategoryLoadMore'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { getCategoryAccent } from '@/constants/categoryTheme'
import { DESKTOP_CATEGORY_FEATURED_COUNT } from '@/lib/home/desktopCategoryPortal'
import { timelinePostToNewsItem } from '@/lib/newsItemToTimelinePost'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants/routes'
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
 * Desktop category portal — hero + chips + 4-up cards.
 * Mobile magazine landing is unchanged.
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
  const heroTitle = isSubcategory ? cat.name : pageTitle
  const accent = getCategoryAccent(cat.id)
  const parentSlug = tabParent?.slug ?? parentCat?.slug

  const newsItems = useMemo(
    () => initialPosts.map(timelinePostToNewsItem),
    [initialPosts]
  )
  const featured = newsItems.slice(0, DESKTOP_CATEGORY_FEATURED_COUNT)
  const rest = newsItems.slice(DESKTOP_CATEGORY_FEATURED_COUNT)
  const heroImage = newsItems.find((item) => item.imageUrl)?.imageUrl
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
      className="dcp-page desktop-category-page"
      data-testid="desktop-category-portal"
      style={{ ['--cat-accent' as string]: accent.rgb }}
    >
      <DesktopCategoryHero title={heroTitle} categoryId={cat.id} imageUrl={heroImage} />

      <div className="dcp-body">
        {showTabs && parentSlug ? (
          <nav className="dcp-subnav" aria-label="Alt kategoriler" data-no-category-swipe>
            <Link
              href={ROUTES.CATEGORY(parentSlug)}
              className={cn('dcp-chip', !isSubcategory && 'is-active')}
            >
              Tümü
            </Link>
            {subTabs.map((sub) => (
              <Link
                key={sub.id}
                href={sub.href}
                className={cn('dcp-chip', sub.active && 'is-active')}
              >
                {sub.name}
              </Link>
            ))}
          </nav>
        ) : null}

        {topSlot ? <div className="dcp-extras">{topSlot}</div> : null}

        {showFeed ? (
          <>
            <DesktopAdBanner slot={`category-${cat.id}-top`} size="large" className="mt-6" />

            {featured.length > 0 ? (
              <div className="dcp-grid" data-testid="desktop-category-featured">
                {featured.map((item, index) => (
                  <DesktopCategoryCard key={item.id} item={item} priority={index < 2} />
                ))}
              </div>
            ) : null}

            {rest.length > 0 ? (
              <div className="dcp-grid">
                {rest.map((item) => (
                  <DesktopCategoryCard key={item.id} item={item} />
                ))}
              </div>
            ) : null}

            <CategoryLoadMore
              categoryId={cat.id}
              initialItems={newsItems}
              initialBeforeDay={initialBeforeDay}
              initialHasMore={initialPosts.length > 0}
              layout="desktop-grid"
            />

            <DesktopAdBanner slot={`category-${cat.id}-bottom`} size="large" className="mt-10" />
          </>
        ) : null}
      </div>
    </div>
  )
}
