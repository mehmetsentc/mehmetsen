'use client'

import { useMemo } from 'react'
import { BreakingStories } from '@/components/home/BreakingStories'
import { FeaturedSlider } from '@/components/home/FeaturedSlider'
import { MarketTicker } from '@/components/home/MarketTicker'
import { MobileMagazineFeed } from '@/components/home/MobileMagazineFeed'
import { CategoryRail } from '@/components/home/CategoryRail'
import { MustReadSection } from '@/components/home/MustReadSection'
import { LocalNewsSection } from '@/components/home/LocalNewsSection'
import { LocationPermission } from '@/components/home/LocationPermission'
import { TrendingRail } from '@/components/home/TrendingRail'
import { OnThisDayArchive } from '@/components/home/OnThisDayArchive'
import { useHomeFeedInfinite } from '@/hooks/useHomeFeedInfinite'
import { getCategoryLabel } from '@/lib/newsMapper'
import { HOME_CATEGORY_RAILS, type HomeFeedInitialData } from '@/types/newsItem'

interface HomeFeedProps {
  data: HomeFeedInitialData
}

export function HomeFeed({ data }: HomeFeedProps) {
  const { breaking, featured, latest, trending, mostRead, categoryRails } = data

  const breakingIds = useMemo(() => new Set(breaking.map((b) => b.id)), [breaking])
  const trendingIds = useMemo(() => new Set(trending.map((t) => t.id)), [trending])

  const dedupedLatest = useMemo(
    () =>
      latest.filter(
        (item) =>
          !breakingIds.has(item.id) &&
          !trendingIds.has(item.id) &&
          item.category !== 'son-dakika'
      ),
    [latest, breakingIds, trendingIds]
  )

  const feedHead = useMemo(() => dedupedLatest.slice(0, 6), [dedupedLatest])
  const feedTail = useMemo(() => dedupedLatest.slice(6), [dedupedLatest])

  const { items: moreItems, loadingMore, sentinelRef } = useHomeFeedInfinite(feedTail)

  return (
    <div className="home-feed mx-auto w-full max-w-3xl pb-6">
      <LocationPermission />

      <BreakingStories items={breaking} />
      <FeaturedSlider items={featured} />
      <MarketTicker />

      <TrendingRail items={trending} />

      <section className="home-section" aria-label="Son haberler">
        <div className="home-rail-title">
          <span className="home-rail-accent" aria-hidden />
          <h2 className="text-lg font-black text-[rgb(var(--color-text))]">Akış</h2>
        </div>
        <MobileMagazineFeed items={feedHead} />
      </section>

      <MustReadSection items={mostRead} />

      <OnThisDayArchive />

      {HOME_CATEGORY_RAILS.map((categoryId) => {
        const items = categoryRails[categoryId]
        if (!items?.length) return null
        return (
          <CategoryRail
            key={categoryId}
            categoryId={categoryId}
            title={getCategoryLabel(categoryId)}
            items={items}
          />
        )
      })}

      <LocalNewsSection />

      {moreItems.length > 0 ? (
        <section className="home-section" aria-label="Daha fazla haber">
          <MobileMagazineFeed
            items={moreItems}
            loadingMore={loadingMore}
            sentinelRef={sentinelRef}
          />
        </section>
      ) : null}
    </div>
  )
}
