'use client'

import { useMemo } from 'react'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopCategoryHero } from '@/components/home/desktop/DesktopCategoryHero'
import { EdHeadlineList, EdLeadBand, EdRiver } from '@/components/home/desktop/EditorialFrontPage'
import { CategoryLoadMore } from '@/components/category/CategoryLoadMore'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { getCategoryAccent } from '@/constants/categoryTheme'
import { timelinePostToNewsItem } from '@/lib/newsItemToTimelinePost'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import type { CategoryDef } from '@/constants/config'
import type { NewsItem } from '@/types/newsItem'
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
  showTabs: _showTabs = false,
}: DesktopCategoryPageProps) {
  useScrollHeaderConfig({ subcategories: subTabs, tabParent })

  const pageTitle =
    pageTitleProp ??
    (isSubcategory && parentCat ? `${parentCat.name} · ${cat.name}` : cat.name)
  const heroTitle = isSubcategory ? cat.name : pageTitle
  const accent = getCategoryAccent(cat.id)

  const newsItems = useMemo(
    () => initialPosts.map(timelinePostToNewsItem),
    [initialPosts]
  )
  const lead = newsItems.find((item) => item.imageUrl?.trim()) ?? newsItems[0] ?? null
  const afterLead = newsItems.filter((item) => item.id !== lead?.id)
  const lastPost = initialPosts[initialPosts.length - 1]
  const initialBeforeDay = previousTurkeyDayFromPublishedAt(
    lastPost?.publishedAt == null
      ? undefined
      : typeof lastPost.publishedAt === 'number'
        ? lastPost.publishedAt
        : String(lastPost.publishedAt)
  )

  const side = afterLead.filter((item) => item.imageUrl?.trim()).slice(0, 2)
  const sideIds = new Set(side.map((item) => item.id))
  const river = afterLead.filter((item) => !sideIds.has(item.id))

  return (
    <div
      className="dcp-page desktop-category-page ed-category"
      data-testid="desktop-category-portal"
      style={{ ['--cat-accent' as string]: accent.rgb }}
    >
      <DesktopCategoryHero title={heroTitle} categoryId={cat.id} lead={null} />

      <div className="dcp-body">
        {/* Alt kategori sekmeleri header'da tek satır (DesktopWebHeader). */}
        {topSlot ? <div className="dcp-extras">{topSlot}</div> : null}

        {showFeed ? (
          <>
            {lead ? <EdLeadBand lead={lead} side={side} /> : null}

            <DesktopAdBanner slot={`category-${cat.id}-top`} size="large" className="mt-6" />

            <div className="ed-main ed-main--category">
              <div className="ed-main__body" data-testid="desktop-category-featured">
                <EdRiver items={river} />
                <CategoryLoadMore
                  categoryId={cat.id}
                  initialItems={newsItems}
                  initialBeforeDay={initialBeforeDay}
                  initialHasMore={initialPosts.length > 0}
                  layout="desktop-grid"
                />
              </div>
              <aside className="ed-main__rail" aria-label="Öne çıkan başlıklar">
                {river.length > 6 ? (
                  <section className="ed-rail-block ed-rail-block--sticky">
                    <h2 className="ed-rail-block__title">Öne çıkanlar</h2>
                    <EdHeadlineList items={river.slice(0, 6)} numbered />
                  </section>
                ) : null}
              </aside>
            </div>

            <DesktopAdBanner slot={`category-${cat.id}-bottom`} size="large" className="mt-10" />
          </>
        ) : null}
      </div>
    </div>
  )
}
