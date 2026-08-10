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
import { CityCinemaEventsStrip } from '@/components/city/CityCinemaEventsStrip'
import { useHomeFeedInfinite } from '@/hooks/useHomeFeedInfinite'
import type { HomeFeedInitialData, HomeCategorySlug } from '@/types/newsItem'
import type { NaEvent } from '@/types/event'
import { FEATURED_CAROUSEL_LIMIT, HOME_FEATURED_LIMIT } from '@/types/newsItem'

interface HomeFeedProps {
  data: HomeFeedInitialData
  /** City tenant — hides national-only sections and scopes category rails. */
  cityMode?: boolean
  categoryRailIds?: readonly HomeCategorySlug[]
  cinemaEvents?: NaEvent[]
  cityName?: string
}

export function HomeFeed({
  data,
  cityMode = false,
  categoryRailIds,
  cinemaEvents = [],
  cityName,
}: HomeFeedProps) {
  const { breaking, featured, latest, trending, mostRead, categoryRails } = data

  const breakingIds = useMemo(() => new Set(breaking.map((b) => b.id)), [breaking])
  const trendingIds = useMemo(() => new Set(trending.map((t) => t.id)), [trending])

  // Mobile hero slider: prefer CMS-pinned featured posts; fall back to latest
  // news with images so the carousel is never blank. Desktop "Öne Çıkan" grid
  // (DesktopFeaturedGrid) stays featured-only — this fallback is slider-only.
  const featuredPins = useMemo(
    () => featured.filter((item) => item.featured === true).slice(0, HOME_FEATURED_LIMIT),
    [featured]
  )
  const hasFeaturedPins = featuredPins.length > 0
  const sliderItems = useMemo(
    () => hasFeaturedPins ? featuredPins : latest.filter((item) => item.imageUrl).slice(0, FEATURED_CAROUSEL_LIMIT),
    [hasFeaturedPins, featuredPins, latest]
  )

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
          <FeaturedSlider items={sliderItems} isFeatured={hasFeaturedPins} />
        </div>
        <div className="order-3 mt-0 max-md:mt-5">
          <MarketTicker />
        </div>
        {cityMode && cinemaEvents.length > 0 ? (
          <div className="order-4 mt-5">
            <CityCinemaEventsStrip events={cinemaEvents} cityName={cityName} />
          </div>
        ) : null}
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
      {!cityMode ? <LocationPermission /> : null}

      <MustReadSection items={mostRead} />

      {!cityMode ? (
        <LazySection minHeight={220}>
          <GamesRail />
        </LazySection>
      ) : null}

      <LazyCategoryRails
        initialRails={categoryRails}
        categoryIds={cityMode ? categoryRailIds : undefined}
      />

      {!cityMode ? (
        <LazySection minHeight={280}>
          <LocalNewsSection />
        </LazySection>
      ) : null}

      {!cityMode && (moreItems.length > 0 || hasMore) ? (
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
