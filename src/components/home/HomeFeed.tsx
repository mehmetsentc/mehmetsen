'use client'

import { useMemo } from 'react'
import { MarketTicker } from '@/components/home/MarketTicker'
import { LocalNewsSection } from '@/components/home/LocalNewsSection'
import { LocationPermission } from '@/components/home/LocationPermission'
import { LazySection } from '@/components/home/LazySection'
import { CityCinemaEventsStrip } from '@/components/city/CityCinemaEventsStrip'
import { SourceStories } from '@/components/home/SourceStories'
import { FeaturedSlider } from '@/components/home/FeaturedSlider'
import { MagazineNewsList } from '@/components/home/MagazineNewsList'
import { HomeCategoryGrid } from '@/components/home/HomeCategoryGrid'
import { MustReadSection } from '@/components/home/MustReadSection'
import { useHomeFeedInfinite } from '@/hooks/useHomeFeedInfinite'
import { useMergedCategoryRails } from '@/hooks/useMergedCategoryRails'
import { fillHomeFeaturedRail } from '@/lib/featuredScope'
import {
  buildMagazineStream,
  collectMagazineCandidates,
  sequentialCategoryLatest,
} from '@/lib/home/magazineStream'
import {
  collectHomeStoryCandidates,
  groupNewsBySource,
  MAGAZINE_INLINE_CATEGORY_ORDER,
} from '@/lib/home/sourceStories'
import { HOME_FEATURED_RAIL_LIMIT } from '@/types/newsItem'
import type { NaEvent } from '@/types/event'
import type { HomeCategorySlug, HomeFeedInitialData, NewsItem } from '@/types/newsItem'

interface HomeFeedProps {
  data: HomeFeedInitialData
  /** City tenant — hides national-only sections and scopes category rails. */
  cityMode?: boolean
  categoryRailIds?: readonly HomeCategorySlug[]
  cinemaEvents?: NaEvent[]
  cityName?: string
}

function flattenRails(rails: HomeFeedInitialData['categoryRails']): NewsItem[] {
  return Object.values(rails).flatMap((items) => items ?? [])
}

export function HomeFeed({
  data,
  cityMode = false,
  cinemaEvents = [],
  cityName,
}: HomeFeedProps) {
  const { latest, featured, categoryRails, mostRead } = data

  const mergedRails = useMergedCategoryRails(
    categoryRails,
    cityMode ? [] : MAGAZINE_INLINE_CATEGORY_ORDER,
    cityMode ? 0 : 800
  )

  const storyGroups = useMemo(
    () =>
      groupNewsBySource(
        collectHomeStoryCandidates({ latest, featured, categoryRails: mergedRails })
      ),
    [latest, featured, mergedRails]
  )

  const featuredRail = useMemo(
    () =>
      fillHomeFeaturedRail(
        featured,
        [...latest, ...flattenRails(categoryRails)],
        cityMode,
        HOME_FEATURED_RAIL_LIMIT
      ),
    [featured, latest, categoryRails, cityMode]
  )

  const featuredIds = useMemo(
    () => new Set(featuredRail.map((item) => item.id)),
    [featuredRail]
  )

  const { items: moreItems, loadingMore, hasMore, loadMore } = useHomeFeedInfinite(
    latest
  )

  const magazineItems = useMemo(() => {
    const sequencedSeed = sequentialCategoryLatest(
      collectMagazineCandidates(latest, categoryRails).filter(
        (item) => !featuredIds.has(item.id)
      )
    )
    const seedIds = new Set(sequencedSeed.map((item) => item.id))
    const tail = moreItems.filter(
      (item) => !seedIds.has(item.id) && !featuredIds.has(item.id)
    )
    return [...sequencedSeed, ...tail]
  }, [latest, categoryRails, moreItems, featuredIds])

  const magazineBlocks = useMemo(
    () =>
      buildMagazineStream({
        items: magazineItems,
        rails: mergedRails,
      }),
    [magazineItems, mergedRails]
  )

  const lastMagazineIndex = magazineBlocks.reduce(
    (last, block, index) => (block.kind === 'magazine' ? index : last),
    -1
  )

  return (
    <div className="home-feed home-feed--magazine mx-auto w-full pb-6" data-testid="home-magazine-feed">
      <SourceStories groups={storyGroups} />

      <FeaturedSlider
        items={featuredRail}
        isFeatured={!cityMode}
        limit={HOME_FEATURED_RAIL_LIMIT}
      />

      {!cityMode ? (
        <div className="mt-1" data-testid="home-market-ticker">
          <MarketTicker />
        </div>
      ) : null}

      {magazineBlocks.length > 0 ? (
        magazineBlocks.map((block, index) =>
          block.kind === 'magazine' ? (
            <MagazineNewsList
              key={`mag-${block.items[0]?.id ?? index}`}
              items={block.items}
              priorityCount={index === 0 ? 2 : 0}
              loadingMore={!cityMode && loadingMore && index === lastMagazineIndex}
              hasMore={!cityMode && hasMore && index === lastMagazineIndex}
              onLoadMore={
                !cityMode && index === lastMagazineIndex ? () => void loadMore() : undefined
              }
            />
          ) : (
            <HomeCategoryGrid
              key={`grid-${block.categoryId}`}
              categoryId={block.categoryId}
              items={block.items}
            />
          )
        )
      ) : storyGroups.length === 0 && featuredRail.length === 0 ? (
        <div className="mag-feed" aria-busy="true" aria-label="Haberler yükleniyor">
          {[0, 1].map((i) => (
            <div key={`empty-sk-${i}`} className="mag-card mag-card--skeleton" aria-hidden>
              <div className="mag-card__media animate-pulse bg-[rgb(var(--color-border))]" />
            </div>
          ))}
        </div>
      ) : null}

      {!cityMode && mostRead.length > 0 ? <MustReadSection items={mostRead} /> : null}

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
    </div>
  )
}
