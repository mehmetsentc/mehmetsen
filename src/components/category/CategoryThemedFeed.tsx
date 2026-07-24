'use client'

import { useEffect, useRef } from 'react'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import {
  getCategorySectionDef,
  getCategorySectionHref,
  getThemedCategorySectionIds,
} from '@/constants/categorySections'
import { CategoryBbcSection } from '@/components/category/CategoryBbcSection'
import { CategoryHeroCarousel } from '@/components/category/CategoryHeroCarousel'
import { CategoryStoryRail } from '@/components/category/CategoryStoryRail'
import { DESKTOP_SECTION_DIVIDER } from '@/components/home/desktop/desktopLayout'
import { TimelineItem } from '@/components/feed/TimelineItem'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import {
  MatchResults,
  sportMatchKindForSection,
} from '@/components/sports/MatchResults'
import { useThemedCategoryFeed } from '@/hooks/useThemedCategoryFeed'
import { getCategoryAccent } from '@/constants/categoryTheme'
import type { TimelinePost } from '@/types/post'

interface CategoryThemedFeedProps {
  parentCategoryId: string
  initialPosts?: TimelinePost[]
  variant: 'desktop' | 'mobile'
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
      { rootMargin: '200px', threshold: 0 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [onVisible, enabled])

  return <div ref={ref} className="h-px" aria-hidden />
}

function SectionLoadMoreSentinel({
  onLoadMore,
  loading,
  hasMore,
  enabled,
}: {
  onLoadMore: () => void
  loading: boolean
  hasMore: boolean
  enabled: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) onLoadMore()
      },
      { rootMargin: '400px', threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [onLoadMore, loading, hasMore, enabled])

  return <div ref={ref} className="h-1" aria-hidden />
}

function sectionTitle(sectionId: string): string {
  const def = getCategorySectionDef(sectionId)
  if (!def) return sectionId
  const parent = DEFAULT_CATEGORIES.find((c) => c.id === def.parentId)
  if (parent && sectionId !== parent.id) return def.name
  return def.name
}

function SportScoresForSection({
  sectionId,
  enabled,
}: {
  sectionId: string
  enabled: boolean
}) {
  if (!enabled) return null
  const sport = sportMatchKindForSection(sectionId)
  if (!sport) return null
  return <MatchResults sport={sport} className="mb-5" />
}

function DesktopSectionBlock({
  sectionId,
  posts,
  loading,
  loaded,
  loadingMore,
  hasMore,
  onEnsureLoaded,
  onLoadMore,
  scrollActivated,
  showHeader,
  isFirstSection,
  accentRgb,
  showSportScores,
}: {
  sectionId: string
  posts: TimelinePost[]
  loading: boolean
  loaded: boolean
  loadingMore: boolean
  hasMore: boolean
  onEnsureLoaded: () => void
  onLoadMore: () => void
  scrollActivated: boolean
  showHeader: boolean
  isFirstSection: boolean
  accentRgb?: string
  showSportScores: boolean
}) {
  const title = sectionTitle(sectionId)
  const href = getCategorySectionHref(sectionId)

  return (
    <section className={DESKTOP_SECTION_DIVIDER} aria-label={title}>
      <SectionVisibilityTrigger onVisible={onEnsureLoaded} enabled={scrollActivated} />

      <CategoryBbcSection
        title={title}
        href={href}
        posts={posts}
        showHeader={showHeader}
        isFirstSection={isFirstSection}
        loading={loading || !loaded}
        loadingMore={loadingMore}
        accentRgb={accentRgb}
        beforeContent={
          <SportScoresForSection sectionId={sectionId} enabled={showSportScores} />
        }
      />

      <SectionLoadMoreSentinel
        onLoadMore={onLoadMore}
        loading={loadingMore || loading}
        hasMore={hasMore}
        enabled={scrollActivated}
      />
    </section>
  )
}

function MobileSectionBlock({
  sectionId,
  posts,
  loading,
  loaded,
  loadingMore,
  hasMore,
  onEnsureLoaded,
  onLoadMore,
  scrollActivated,
  showHeader,
  isFirstSection = false,
  accentRgb,
  showSportScores,
}: {
  sectionId: string
  posts: TimelinePost[]
  loading: boolean
  loaded: boolean
  loadingMore: boolean
  hasMore: boolean
  onEnsureLoaded: () => void
  onLoadMore: () => void
  scrollActivated: boolean
  showHeader: boolean
  isFirstSection?: boolean
  accentRgb?: string
  showSportScores: boolean
}) {
  const title = sectionTitle(sectionId)

  // First section leads with a swipeable hero carousel (top 5). Other sections
  // keep a single hero. A horizontal "discover" rail sits between the hero and
  // the vertical timeline to break the monotony of stacked cards.
  const heroCount = isFirstSection ? Math.min(posts.length, 5) : posts.length > 0 ? 1 : 0
  const heroPosts = posts.slice(0, heroCount)
  const railPosts = posts.slice(heroCount, heroCount + 6)
  const rest = posts.slice(heroCount + railPosts.length)

  return (
    <section className="mb-10" aria-label={title}>
      <SectionVisibilityTrigger onVisible={onEnsureLoaded} enabled={scrollActivated} />

      {showHeader || isFirstSection ? (
        <h2 className="bbc-section-label bbc-section-label--accent mb-4" style={
          accentRgb ? ({ ['--cat-accent' as string]: accentRgb } as React.CSSProperties) : undefined
        }>{showHeader ? title : 'Öne çıkanlar'}</h2>
      ) : null}

      <SportScoresForSection sectionId={sectionId} enabled={showSportScores} />

      {/* Show a skeleton until the section has actually attempted to load, so we
          never flash "Henüz haber yok" before the fetch runs. */}
      {posts.length === 0 && !loaded ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <TimelineItemSkeleton key={i} />
          ))}
        </div>
      ) : null}

      {loaded && !loading && posts.length === 0 ? (
        <p className="py-4 text-center text-sm text-[rgb(var(--color-muted))]">Henüz haber yok</p>
      ) : null}

      {heroPosts.length > 0 ? (
        <div className="mb-6">
          <CategoryHeroCarousel
            posts={heroPosts}
            accentRgb={accentRgb}
            priority={isFirstSection}
          />
        </div>
      ) : null}

      {railPosts.length > 0 ? (
        <CategoryStoryRail
          title="Keşfet"
          posts={railPosts}
          accentRgb={accentRgb}
          className="mb-6"
        />
      ) : null}

      <div className="timeline-list">
        {rest.map((post, i) => (
          <TimelineItem key={post.id} post={post} isLast={i === rest.length - 1 && !hasMore} />
        ))}
      </div>

      {loadingMore ? <TimelineItemSkeleton /> : null}
      <SectionLoadMoreSentinel
        onLoadMore={onLoadMore}
        loading={loadingMore || loading}
        hasMore={hasMore}
        enabled={scrollActivated}
      />
    </section>
  )
}

export function CategoryThemedFeed({
  parentCategoryId,
  initialPosts = [],
  variant,
}: CategoryThemedFeedProps) {
  const sectionIds = getThemedCategorySectionIds(parentCategoryId)
  const { sections, activated, ensureSectionLoaded, loadMoreSection } = useThemedCategoryFeed(
    sectionIds,
    initialPosts
  )

  // Eagerly load the first section on mount so the top of the category page has
  // content immediately, without requiring a scroll gesture. Subsequent sections
  // lazy-load as they scroll near the viewport.
  const bootedRef = useRef(false)
  useEffect(() => {
    if (bootedRef.current) return
    const first = sectionIds[0]
    if (!first) return
    bootedRef.current = true
    ensureSectionLoaded(first)
  }, [sectionIds, ensureSectionLoaded])

  if (sectionIds.length === 0) return null

  const Block = variant === 'desktop' ? DesktopSectionBlock : MobileSectionBlock

  const multiSection = sectionIds.length > 1
  const accent = getCategoryAccent(parentCategoryId)
  // Skor şeritleri yalnızca /kategori/spor alt bölümlerinde; alt kategori
  // sayfalarında CategoryTopExtras zaten MatchResults basıyor.
  const showSportScores = parentCategoryId === 'spor'

  return (
    <div className="category-themed-feed bbc-category-feed">
      {sectionIds.map((sectionId, index) => {
        const state = sections[sectionId]
        if (!state) return null
        return (
          <Block
            key={sectionId}
            sectionId={sectionId}
            posts={state.posts}
            loading={state.loading}
            loaded={state.loaded}
            loadingMore={state.loadingMore}
            hasMore={state.hasMore}
            onEnsureLoaded={() => ensureSectionLoaded(sectionId)}
            onLoadMore={() => loadMoreSection(sectionId)}
            scrollActivated={activated}
            showHeader={multiSection}
            isFirstSection={index === 0}
            accentRgb={accent.rgb}
            showSportScores={showSportScores}
          />
        )
      })}
    </div>
  )
}
