'use client'

import { useEffect, useRef } from 'react'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import {
  getCategorySectionDef,
  getCategorySectionHref,
  getThemedCategorySectionIds,
} from '@/constants/categorySections'
import { CategoryBbcSection } from '@/components/category/CategoryBbcSection'
import { CategoryHeroStory } from '@/components/category/CategoryPostStories'
import { DESKTOP_SECTION_DIVIDER } from '@/components/home/desktop/desktopLayout'
import { TimelineItem } from '@/components/feed/TimelineItem'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { useThemedCategoryFeed } from '@/hooks/useThemedCategoryFeed'
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

function DesktopSectionBlock({
  sectionId,
  posts,
  loading,
  loadingMore,
  hasMore,
  onEnsureLoaded,
  onLoadMore,
  scrollActivated,
  showHeader,
  isFirstSection,
}: {
  sectionId: string
  posts: TimelinePost[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onEnsureLoaded: () => void
  onLoadMore: () => void
  scrollActivated: boolean
  showHeader: boolean
  isFirstSection: boolean
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
        loading={loading}
        loadingMore={loadingMore}
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
  loadingMore,
  hasMore,
  onEnsureLoaded,
  onLoadMore,
  scrollActivated,
  showHeader,
  isFirstSection = false,
}: {
  sectionId: string
  posts: TimelinePost[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onEnsureLoaded: () => void
  onLoadMore: () => void
  scrollActivated: boolean
  showHeader: boolean
  isFirstSection?: boolean
}) {
  const title = sectionTitle(sectionId)
  const hero = posts[0]
  const rest = posts.slice(1)

  return (
    <section className="mb-10" aria-label={title}>
      <SectionVisibilityTrigger onVisible={onEnsureLoaded} enabled={scrollActivated} />

      {showHeader || isFirstSection ? (
        <h2 className="mb-4 border-t-4 border-[rgb(var(--color-text))] pt-3 text-xl font-bold text-[rgb(var(--color-text))]">
          {showHeader ? title : 'Öne çıkanlar'}
        </h2>
      ) : null}

      {loading && posts.length === 0 ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <TimelineItemSkeleton key={i} />
          ))}
        </div>
      ) : null}

      {!loading && posts.length === 0 ? (
        <p className="py-4 text-center text-sm text-[rgb(var(--color-muted))]">Henüz haber yok</p>
      ) : null}

      {hero ? (
        <div className="mb-6">
          <CategoryHeroStory post={hero} priority={isFirstSection} />
        </div>
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

  if (sectionIds.length === 0) return null

  const Block = variant === 'desktop' ? DesktopSectionBlock : MobileSectionBlock

  const multiSection = sectionIds.length > 1

  return (
    <div className="category-themed-feed">
      {sectionIds.map((sectionId, index) => {
        const state = sections[sectionId]
        if (!state) return null
        return (
          <Block
            key={sectionId}
            sectionId={sectionId}
            posts={state.posts}
            loading={state.loading}
            loadingMore={state.loadingMore}
            hasMore={state.hasMore}
            onEnsureLoaded={() => ensureSectionLoaded(sectionId)}
            onLoadMore={() => loadMoreSection(sectionId)}
            scrollActivated={activated}
            showHeader={multiSection}
            isFirstSection={index === 0}
          />
        )
      })}
    </div>
  )
}
