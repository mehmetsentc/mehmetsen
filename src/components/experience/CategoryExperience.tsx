'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import {
  getCategorySectionDef,
  getCategorySectionHref,
  getThemedCategorySectionIds,
} from '@/constants/categorySections'
import { useThemedCategoryFeed } from '@/hooks/useThemedCategoryFeed'
import { ExperienceFeed } from './ExperienceFeed'
import { experienceThemeStyle, getExperienceTheme } from './theme'
import { CategoryHeroCarousel } from '@/components/category/CategoryHeroCarousel'
import { cn } from '@/lib/utils'
import type { TimelinePost } from '@/types/post'
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

function SectionVisibilityTrigger({
  onVisible,
  enabled,
}: {
  onVisible: () => void
  enabled: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !firedRef.current) {
          firedRef.current = true
          onVisible()
        }
      },
      { rootMargin: '240px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onVisible, enabled])

  return <div ref={ref} className="h-px" aria-hidden />
}

export function CategoryExperience({
  categoryId,
  initialPosts = [],
  breakpoint = 'mobile',
  className,
}: CategoryExperienceProps) {
  const sectionIds = getThemedCategorySectionIds(categoryId)
  const theme = useMemo(() => getExperienceTheme(categoryId), [categoryId])
  const { sections, activated, ensureSectionLoaded, loadMoreSection } = useThemedCategoryFeed(
    sectionIds,
    initialPosts
  )

  const bootedRef = useRef(false)
  useEffect(() => {
    if (bootedRef.current) return
    const first = sectionIds[0]
    if (!first) return
    bootedRef.current = true
    ensureSectionLoaded(first)
  }, [sectionIds, ensureSectionLoaded])

  if (sectionIds.length === 0) return null

  const multi = sectionIds.length > 1
  const isMobile = breakpoint === 'mobile'
  const style = experienceThemeStyle(theme)

  return (
    <div
      className={cn('exp-shell', `exp-shell--${theme.mood}`, `exp-shell--${breakpoint}`, className)}
      style={style}
      data-mood={theme.mood}
      data-no-category-swipe
    >
      {sectionIds.map((sectionId, index) => {
        const state = sections[sectionId]
        if (!state) return null
        const isFirst = index === 0
        const title = sectionTitle(sectionId)
        const href = getCategorySectionHref(sectionId)
        const heroPosts = isFirst && isMobile ? state.posts.slice(0, 5) : []
        const feedPosts =
          isFirst && isMobile && heroPosts.length > 0 ? state.posts.slice(5) : state.posts

        return (
          <section key={sectionId} className="exp-section mb-10" aria-label={title}>
            <SectionVisibilityTrigger
              onVisible={() => ensureSectionLoaded(sectionId)}
              enabled={activated}
            />

            {multi || isFirst ? (
              <div className="exp-section__head mb-4 flex items-end justify-between gap-3">
                <h2 className="exp-section__title">{multi ? title : 'Öne çıkanlar'}</h2>
                {multi ? (
                  <Link href={href} className="exp-section__more">
                    Tümü
                  </Link>
                ) : null}
              </div>
            ) : null}

            {heroPosts.length > 0 ? (
              <div className="mb-5">
                <CategoryHeroCarousel
                  posts={heroPosts}
                  accentRgb={theme.accentRgb}
                  priority={isFirst}
                />
              </div>
            ) : null}

            <ExperienceFeed
              posts={feedPosts}
              theme={theme}
              loading={state.loading || !state.loaded}
              loadingMore={state.loadingMore}
              hasMore={state.hasMore}
              onLoadMore={() => loadMoreSection(sectionId)}
              showDiscoverRail={isFirst}
            />
          </section>
        )
      })}
    </div>
  )
}
