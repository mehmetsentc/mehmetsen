'use client'

import { useMemo } from 'react'
import { BreakingStories } from '@/components/home/BreakingStories'
import { FeaturedSlider } from '@/components/home/FeaturedSlider'
import { MarketTicker } from '@/components/home/MarketTicker'
import { MobileMagazineFeed } from '@/components/home/MobileMagazineFeed'
import { MustReadSection } from '@/components/home/MustReadSection'
import { LocalNewsSection } from '@/components/home/LocalNewsSection'
import { LocationPermission } from '@/components/home/LocationPermission'
import { TrendingRail } from '@/components/home/TrendingRail'
import { OnThisDayArchive } from '@/components/home/OnThisDayArchive'
import { FootballWidget } from '@/components/football/FootballWidget'
import { GamesRail } from '@/components/home/GamesRail'
import { LazySection } from '@/components/home/LazySection'
import { LazyCategoryRails } from '@/components/home/LazyCategoryRails'
import { useHomeFeedInfinite } from '@/hooks/useHomeFeedInfinite'
import type { HomeFeedInitialData } from '@/types/newsItem'
import { HOME_FEATURED_LIMIT } from '@/types/newsItem'

interface HomeFeedProps {
  data: HomeFeedInitialData
}

export function HomeFeed({ data }: HomeFeedProps) {
  const { breaking, featured, latest, trending, mostRead, categoryRails } = data

  const breakingIds = useMemo(() => new Set(breaking.map((b) => b.id)), [breaking])
  const trendingIds = useMemo(() => new Set(trending.map((t) => t.id)), [trending])
  const featuredItems = useMemo(() => {
    const pins = featured.filter((item) => item.featured === true).slice(0, HOME_FEATURED_LIMIT)
    if (pins.length >= HOME_FEATURED_LIMIT) return pins
    const ids = new Set(pins.map((p) => p.id))
    const fillers = latest.filter((item) => !ids.has(item.id)).slice(0, HOME_FEATURED_LIMIT - pins.length)
    return [...pins, ...fillers]
  }, [featured, latest])

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
      <BreakingStories items={breaking} />
      <FeaturedSlider items={featuredItems} />
      <MarketTicker />

      <section className="home-section" aria-label="Son haberler">
        <div className="home-rail-title">
          <span className="home-rail-accent" aria-hidden />
          <h2 className="text-lg font-black text-[rgb(var(--color-text))]">Akış</h2>
        </div>
        <MobileMagazineFeed items={feedHead} />
      </section>

      <TrendingRail items={trending} />
      <LocationPermission />

      <MustReadSection items={mostRead} />

      <OnThisDayArchive />
      <LazySection minHeight={320}>
        <FootballWidget />
      </LazySection>
      <LazySection minHeight={220}>
        <GamesRail />
      </LazySection>

      {/* Kategori rayları — Öne Çıkan haberler burada da kendi kategorilerinde görünür */}
      <LazyCategoryRails initialRails={categoryRails} />

      <LazySection minHeight={280}>
        <LocalNewsSection />
      </LazySection>

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
