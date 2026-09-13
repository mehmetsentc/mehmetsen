'use client'

import { useMemo } from 'react'
import { MarketTicker } from '@/components/home/MarketTicker'
import { LocalNewsSection } from '@/components/home/LocalNewsSection'
import { LocationPermission } from '@/components/home/LocationPermission'
import { LazySection } from '@/components/home/LazySection'
import { CityCinemaEventsStrip } from '@/components/city/CityCinemaEventsStrip'
import { HomeDiscoveryMasonry } from '@/components/home/HomeDiscoveryMasonry'
import { newsItemToDiscovery } from '@/components/home/HomeDiscoveryCard'
import { useHomeFeedInfinite } from '@/hooks/useHomeFeedInfinite'
import { pickHomeFeedFeaturedPins } from '@/lib/featuredScope'
import type { NaEvent } from '@/types/event'
import {
  HOME_FEATURED_LIMIT,
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
  const { featured, latest } = data

  const featuredPins = useMemo(
    () => pickHomeFeedFeaturedPins(featured, cityMode, HOME_FEATURED_LIMIT),
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

  const discoveryItems = useMemo(() => {
    const continued = moreItems.filter((item) => !featuredIds.has(item.id))
    return [...featuredPins, ...continued].map(newsItemToDiscovery)
  }, [featuredPins, moreItems, featuredIds])

  return (
    <div
      className="home-feed home-feed--discovery mx-auto w-full pb-6"
      data-testid="home-visual-discovery"
    >
      {hasFeaturedPins ? (
        <p className="home-discovery-label" data-testid="home-featured-label">
          Öne Çıkanlar
        </p>
      ) : null}

      {discoveryItems.length > 0 ? (
        <HomeDiscoveryMasonry
          items={discoveryItems}
          featuredCount={featuredPins.length}
          priorityCount={Math.min(4, discoveryItems.length)}
          loadingMore={!cityMode && loadingMore}
          hasMore={!cityMode && hasMore}
          onLoadMore={!cityMode ? () => void loadMore() : undefined}
        />
      ) : (
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
      )}

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
