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

  const { items: moreItems, loadingMore, hasMore, loadMore } = useHomeFeedInfinite(feedTail)

  return (
    <div className="home-feed mx-auto w-full max-w-3xl pb-6 max-md:pb-10 max-md:pt-4">
      {/* Mobile: Son Dakika → hero → markets. Tablet+: same logical order. */}
      <div className="flex flex-col">
        <div className="order-1">
          <BreakingStories items={breaking} />
        </div>
        <div className="order-2">
          <FeaturedSlider items={featuredItems} />
        </div>
        <div className="order-3 mt-0 max-md:mt-5">
          <MarketTicker />
        </div>
      </div>

      <section className="home-section max-md:!mb-6 max-md:!mt-7 max-md:!px-0" aria-label="Son haberler">
        <div className="home-rail-title max-md:mb-4 max-md:px-4">
          <span className="home-rail-accent max-md:h-8 max-md:w-[5px]" aria-hidden />
          <h2 className="text-lg font-black text-[rgb(var(--color-text))] max-md:text-[1.75rem]">
            Akış
          </h2>
        </div>
        <MobileMagazineFeed items={feedHead} />
      </section>

      <TrendingRail items={trending} />
      <LocationPermission />

      <MustReadSection items={mostRead} />

      <LazySection minHeight={220}>
        <GamesRail />
      </LazySection>

      {/* Kategori rayları — Öne Çıkan haberler burada da kendi kategorilerinde görünür */}
      <LazyCategoryRails initialRails={categoryRails} />

      <LazySection minHeight={280}>
        <LocalNewsSection />
      </LazySection>

      {moreItems.length > 0 || hasMore ? (
        <section className="home-section" aria-label="Daha fazla haber">
          <MobileMagazineFeed
            items={moreItems}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onLoadMore={() => void loadMore()}
          />
        </section>
      ) : null}
    </div>
  )
}
