'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopCategoryCard } from '@/components/home/desktop/DesktopCategoryCard'
import { DesktopCategoryHero } from '@/components/home/desktop/DesktopCategoryHero'
import { CategoryLoadMore } from '@/components/category/CategoryLoadMore'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { getCategoryAccent } from '@/constants/categoryTheme'
import { formatNewsClockTime } from '@/components/home/desktop/formatNewsDate'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { DESKTOP_CATEGORY_FEATURED_COUNT } from '@/lib/home/desktopCategoryPortal'
import { timelinePostToNewsItem } from '@/lib/newsItemToTimelinePost'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
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
 * Desktop category — newspaper section: typographic head, clickable manşet,
 * side rails, then story tiles. Mobile magazine landing is unchanged.
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
  const lead = newsItems.find((item) => item.imageUrl?.trim()) ?? newsItems[0] ?? null
  const afterLead = newsItems.filter((item) => item.id !== lead?.id)
  const railLeft = afterLead.slice(0, 5)
  const railRight = afterLead.slice(5, 10)
  const gridItems = afterLead.slice(10, 10 + DESKTOP_CATEGORY_FEATURED_COUNT)
  const rest = afterLead.slice(10 + DESKTOP_CATEGORY_FEATURED_COUNT)
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
      <DesktopCategoryHero title={heroTitle} categoryId={cat.id} lead={lead} />

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
            {railLeft.length > 0 || railRight.length > 0 ? (
              <section className="dcp-stage" aria-label="Manşet listesi">
                {railLeft.length > 0 ? (
                  <aside className="dcp-rail" aria-label="Diğer başlıklar">
                    <ul>
                      {railLeft.map((item) => (
                        <li key={item.id}>
                          <CategoryRailRow item={item} />
                        </li>
                      ))}
                    </ul>
                  </aside>
                ) : null}
                {railRight.length > 0 ? (
                  <aside className="dcp-rail" aria-label="Daha fazla haber">
                    <ul>
                      {railRight.map((item) => (
                        <li key={item.id}>
                          <CategoryRailRow item={item} />
                        </li>
                      ))}
                    </ul>
                  </aside>
                ) : null}
              </section>
            ) : null}

            <DesktopAdBanner slot={`category-${cat.id}-top`} size="large" className="mt-6" />

            {gridItems.length > 0 ? (
              <div className="dcp-grid" data-testid="desktop-category-featured">
                {gridItems.map((item, index) => (
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

function CategoryRailRow({ item }: { item: NewsItem }) {
  const image = item.imageUrl?.trim()
  const clock = formatNewsClockTime(item.publishedAt ?? item.createdAt)

  return (
    <Link href={newsItemDetailHref(item)} className="dcp-row">
      {image ? (
        <span className="dcp-row__thumb">
          <SafeNewsImage src={image} alt="" fill sizes="56px" className="object-cover" />
        </span>
      ) : null}
      <span className="dcp-row__body">
        {clock ? <span className="dcp-row__time">{clock}</span> : null}
        <span className="dcp-row__title">{item.title}</span>
      </span>
    </Link>
  )
}
