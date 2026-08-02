'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import {
  getCategorySectionDef,
  getCategorySectionHref,
  getThemedCategorySectionIds,
} from '@/constants/categorySections'
import { CategoryHeroCarousel } from '@/components/category/CategoryHeroCarousel'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { newsItemToTimelinePost } from '@/lib/newsItemToTimelinePost'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import { cn } from '@/lib/utils'
import type { TimelinePost } from '@/types/post'
import type { CategoryFeedPage } from '@/services/newsService.server'
import { ExperienceFeed } from './ExperienceFeed'
import { experienceThemeStyle, getExperienceTheme } from './theme'
import type { ExperienceBreakpoint } from './types'

interface CategoryExperienceProps {
  categoryId: string
  initialPosts?: TimelinePost[]
  breakpoint?: ExperienceBreakpoint
  className?: string
}

function sectionTitle(sectionId: string): string {
  const def = getCategorySectionDef(sectionId)
  if (!def) return sectionId
  const parent = DEFAULT_CATEGORIES.find((c) => c.id === def.parentId)
  if (parent && sectionId !== parent.id) return def.name
  return def.name
}

/**
 * NaHaber 3.0 category experience — masonry mood theme.
 * Data: SSR initialPosts + day-based /api/feed/category (no client Firestore).
 */
export function CategoryExperience({
  categoryId,
  initialPosts = [],
  breakpoint = 'mobile',
  className,
}: CategoryExperienceProps) {
  const sectionIds = getThemedCategorySectionIds(categoryId)
  const primaryId = sectionIds[0] ?? categoryId
  const theme = useMemo(() => getExperienceTheme(categoryId), [categoryId])
  const isMobile = breakpoint === 'mobile'
  const multi = sectionIds.length > 1

  const [posts, setPosts] = useState<TimelinePost[]>(initialPosts)
  const [beforeDay, setBeforeDay] = useState<string | null>(() => {
    const last = initialPosts[initialPosts.length - 1]
    return previousTurkeyDayFromPublishedAt(
      last?.publishedAt == null
        ? undefined
        : typeof last.publishedAt === 'number'
          ? last.publishedAt
          : String(last.publishedAt)
    )
  })
  const [hasMore, setHasMore] = useState(initialPosts.length > 0)
  const [isPending, startTransition] = useTransition()
  const [seenIds] = useState(() => new Set(initialPosts.map((p) => p.id)))

  const [siblingPosts, setSiblingPosts] = useState<Record<string, TimelinePost[]>>({})
  const siblingFetchRef = useRef<Set<string>>(new Set())

  const loadMoreDay = useCallback(() => {
    if (!beforeDay || !hasMore || isPending) return
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ id: primaryId, beforeDay })
        const res = await fetch(`/api/feed/category?${params}`)
        if (!res.ok) return
        const data = (await res.json()) as CategoryFeedPage
        const fresh = data.items
          .filter((i) => !seenIds.has(i.id))
          .map((i) => newsItemToTimelinePost(i, primaryId))
        fresh.forEach((p) => seenIds.add(p.id))
        if (fresh.length > 0) setPosts((prev) => [...prev, ...fresh])
        setBeforeDay(data.prevDay)
        setHasMore(Boolean(data.hasMore && data.prevDay))
      } catch {
        setHasMore(false)
      }
    })
  }, [beforeDay, hasMore, isPending, primaryId, seenIds])

  const loadSibling = useCallback(async (sectionId: string) => {
    if (siblingFetchRef.current.has(sectionId)) return
    siblingFetchRef.current.add(sectionId)
    try {
      const res = await fetch(`/api/feed/category?id=${encodeURIComponent(sectionId)}`)
      if (!res.ok) {
        setSiblingPosts((prev) => ({ ...prev, [sectionId]: [] }))
        return
      }
      const data = (await res.json()) as CategoryFeedPage
      setSiblingPosts((prev) => ({
        ...prev,
        [sectionId]: data.items.map((i) => newsItemToTimelinePost(i, sectionId)),
      }))
    } catch {
      setSiblingPosts((prev) => ({ ...prev, [sectionId]: [] }))
    }
  }, [])

  useEffect(() => {
    if (!multi) return
    for (const id of sectionIds.slice(1)) {
      void loadSibling(id)
    }
  }, [multi, sectionIds, loadSibling])

  if (sectionIds.length === 0) return null

  const style = experienceThemeStyle(theme)
  const heroPosts = isMobile ? posts.slice(0, 5) : []
  const feedPosts = isMobile && heroPosts.length > 0 ? posts.slice(5) : posts

  return (
    <div
      className={cn('exp-shell', `exp-shell--${theme.mood}`, `exp-shell--${breakpoint}`, className)}
      style={style}
      data-mood={theme.mood}
      data-no-category-swipe
    >
      <section className="exp-section mb-10" aria-label={sectionTitle(primaryId)}>
        {multi ? (
          <div className="exp-section__head mb-4 flex items-end justify-between gap-3">
            <h2 className="exp-section__title">{sectionTitle(primaryId)}</h2>
            <Link href={getCategorySectionHref(primaryId)} className="exp-section__more">
              Tümü
            </Link>
          </div>
        ) : (
          <div className="exp-section__head mb-4">
            <h2 className="exp-section__title">Öne çıkanlar</h2>
          </div>
        )}

        {heroPosts.length > 0 ? (
          <div className="mb-5">
            <CategoryHeroCarousel posts={heroPosts} accentRgb={theme.accentRgb} priority />
          </div>
        ) : null}

        <ExperienceFeed
          posts={feedPosts}
          theme={theme}
          loading={false}
          loadingMore={isPending}
          hasMore={hasMore}
          onLoadMore={loadMoreDay}
          showDiscoverRail
          loadMoreMode="button"
        />
      </section>

      {multi
        ? sectionIds.slice(1).map((sectionId) => {
            const ready = Object.prototype.hasOwnProperty.call(siblingPosts, sectionId)
            const sibling = siblingPosts[sectionId] ?? []
            return (
              <section key={sectionId} className="exp-section mb-10" aria-label={sectionTitle(sectionId)}>
                <div className="exp-section__head mb-4 flex items-end justify-between gap-3">
                  <h2 className="exp-section__title">{sectionTitle(sectionId)}</h2>
                  <Link href={getCategorySectionHref(sectionId)} className="exp-section__more">
                    Tümü
                  </Link>
                </div>
                <ExperienceFeed
                  posts={sibling}
                  theme={getExperienceTheme(sectionId)}
                  loading={!ready}
                  hasMore={false}
                  showDiscoverRail={false}
                  loadMoreMode="button"
                />
              </section>
            )
          })
        : null}

      {/* Fallback if ExperienceFeed hides button when empty extras — primary already has button */}
      {hasMore && feedPosts.length === 0 ? (
        <LoadMoreDayButton onClick={loadMoreDay} loading={isPending} />
      ) : null}
    </div>
  )
}
