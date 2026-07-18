'use client'

import { useEffect, useMemo, useRef } from 'react'
import { AdaptiveMasonry } from './AdaptiveMasonry'
import { buildExperienceSlots } from './feedRhythm'
import { CategoryStoryRail } from '@/components/category/CategoryStoryRail'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import type { TimelinePost } from '@/types/post'
import type { ExperienceTheme } from './types'

interface ExperienceFeedProps {
  posts: TimelinePost[]
  theme: ExperienceTheme
  loading?: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  /** Insert a discover rail after the first rhythm block. */
  showDiscoverRail?: boolean
}

function LoadMoreSentinel({
  enabled,
  loading,
  onLoadMore,
}: {
  enabled: boolean
  loading: boolean
  onLoadMore?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled || !onLoadMore) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) onLoadMore()
      },
      { rootMargin: '480px', threshold: 0.01 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, loading, onLoadMore])

  return <div ref={ref} className="h-1" aria-hidden />
}

/**
 * Rhythmic infinite feed: slots are assigned via 12-item design cycles so the
 * layout never settles into a monotonous list.
 */
export function ExperienceFeed({
  posts,
  theme,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  showDiscoverRail = true,
}: ExperienceFeedProps) {
  const slots = useMemo(() => buildExperienceSlots(posts), [posts])

  const featured = slots.slice(0, 1)
  const firstBlock = slots.slice(1, 12)
  const rest = slots.slice(12)
  const railPosts = posts.slice(6, 12)

  if (loading && posts.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <TimelineItemSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (!loading && posts.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">Henüz haber yok</p>
    )
  }

  return (
    <div className="exp-feed">
      {featured.length > 0 ? (
        <section className="exp-feed__hero mb-5" aria-label="Öne çıkan">
          <AdaptiveMasonry slots={featured} priorityCount={1} className="exp-masonry--hero" />
        </section>
      ) : null}

      {firstBlock.length > 0 ? (
        <section className="mb-6" aria-label="Keşif">
          <AdaptiveMasonry slots={firstBlock} priorityCount={1} />
        </section>
      ) : null}

      {showDiscoverRail && railPosts.length > 0 ? (
        <CategoryStoryRail
          title="Keşfet"
          posts={railPosts}
          accentRgb={theme.accentRgb}
          className="mb-8"
        />
      ) : null}

      {rest.length > 0 ? (
        <section aria-label="Devam eden akış">
          <AdaptiveMasonry slots={rest} priorityCount={0} />
        </section>
      ) : null}

      {loadingMore ? (
        <div className="mt-4 space-y-3">
          <TimelineItemSkeleton />
          <TimelineItemSkeleton />
        </div>
      ) : null}

      <LoadMoreSentinel enabled={hasMore} loading={loadingMore || loading} onLoadMore={onLoadMore} />
    </div>
  )
}
