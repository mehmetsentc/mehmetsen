'use client'

import { useMemo } from 'react'
import { MarketTicker } from '@/components/home/MarketTicker'
import { LocalNewsSection } from '@/components/home/LocalNewsSection'
import { LocationPermission } from '@/components/home/LocationPermission'
import { LazySection } from '@/components/home/LazySection'
import { CityCinemaEventsStrip } from '@/components/city/CityCinemaEventsStrip'
import { FeaturedSlider } from '@/components/home/FeaturedSlider'
import { HomeCategoryFeaturedRail } from '@/components/home/HomeCategoryFeaturedRail'
import { HomeDiscoveryMasonry } from '@/components/home/HomeDiscoveryMasonry'
import { newsItemToDiscovery } from '@/components/home/HomeDiscoveryCard'
import { useHomeFeedInfinite } from '@/hooks/useHomeFeedInfinite'
import { pickHomeFeedFeaturedPins } from '@/lib/featuredScope'
import { buildDiscoveryStream } from '@/lib/home/discoveryStream'
import type { NaEvent } from '@/types/event'
import {
  FEATURED_CAROUSEL_LIMIT,
  type HomeCategorySlug,
  type HomeFeedInitialData,
} from '@/types/newsItem'

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
  cinemaEvents = [],
  cityName,
}: HomeFeedProps) {
  const { featured, latest, categoryRails } = data

  const featuredPins = useMemo(
    () => pickHomeFeedFeaturedPins(featured, cityMode, FEATURED_CAROUSEL_LIMIT),
    [featured, cityMode]
  )
  const hasFeaturedPins = featuredPins.length > 0
  const featuredIds = useMemo(
    () => new Set(featuredPins.map((item) => item.id)),
    [featuredPins]
  )

  const algorithmItems = useMemo(
    () => latest.filter((item) => !featuredIds.has(item.id)),
    [latest, featuredIds]
  )

  const { items: moreItems, loadingMore, hasMore, loadMore } = useHomeFeedInfinite(
    algorithmItems
  )

  const masonryItems = useMemo(() => {
    const continued = moreItems.filter((item) => !featuredIds.has(item.id))
    return continued.map(newsItemToDiscovery)
  }, [moreItems, featuredIds])

  const discoveryBlocks = useMemo(
    () =>
      buildDiscoveryStream({
        masonryItems,
        rails: categoryRails,
        excludeIds: featuredIds,
      }),
    [masonryItems, categoryRails, featuredIds]
  )

  return (
    <div
      className="home-feed home-feed--discovery mx-auto w-full pb-6"
      data-testid="home-visual-discovery"
    >
      {hasFeaturedPins ? (
        <div data-testid="home-featured-carousel">
          <FeaturedSlider items={featuredPins} isFeatured />
        </div>
      ) : null}

      {discoveryBlocks.length > 0 ? (
        discoveryBlocks.map((block, index) =>
          block.kind === 'masonry' ? (
            <HomeDiscoveryMasonry
              key={`masonry-${block.items[0]?.id ?? index}`}
              items={block.items}
              featuredCount={0}
              priorityCount={index === 0 ? Math.min(4, block.items.length) : 0}
              loadingMore={!cityMode && loadingMore && index === discoveryBlocks.length - 1}
              hasMore={!cityMode && hasMore && index === discoveryBlocks.length - 1}
              onLoadMore={
                !cityMode && index === discoveryBlocks.length - 1
                  ? () => void loadMore()
                  : undefined
              }
            />
          ) : (
            <HomeCategoryFeaturedRail
              key={`rail-${block.categoryId}`}
              categoryId={block.categoryId}
              items={block.items}
            />
          )
        )
      ) : !hasFeaturedPins ? (
        <div
          className="exp-masonry exp-masonry--discovery"
          aria-busy="true"
          aria-label="Haberler yükleniyor"
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={`empty-sk-${i}`}
              className="exp-slot home-discovery-slot home-discovery-skeleton"
              aria-hidden
            >
              <div
                className="home-discovery-card home-discovery-card--skeleton"
                style={{ aspectRatio: i % 2 === 0 ? '4 / 5' : '3 / 4' }}
              />
            </div>
          ))}
        </div>
      ) : null}

      {cityMode && cinemaEvents.length > 0 ? (
        <div className="mt-6">
          <CityCinemaEventsStrip events={cinemaEvents} cityName={cityName} />
        </div>
      ) : null}

      {!cityMode ? <LocationPermission /> : null}

      {!cityMode ? (
        <LazySection minHeight={280}>
          <LocalNewsSection />
        </LazySection>
      ) : null}

      {/* Finance stays available on desktop, never between featured → discovery. */}
      <div className="mt-8 hidden lg:block" data-testid="home-market-ticker-desktop">
        <MarketTicker />
      </div>
    </div>
  )
}
