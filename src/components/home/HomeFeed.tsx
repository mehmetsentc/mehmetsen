'use client'

import { useMemo } from 'react'
import { MarketTicker } from '@/components/home/MarketTicker'
import { LocalNewsSection } from '@/components/home/LocalNewsSection'
import { LocationPermission } from '@/components/home/LocationPermission'
import { LazySection } from '@/components/home/LazySection'
import { CityCinemaEventsStrip } from '@/components/city/CityCinemaEventsStrip'
import { SourceStories } from '@/components/home/SourceStories'
import { MagazineNewsList } from '@/components/home/MagazineNewsList'
import { HomeCategoryGrid } from '@/components/home/HomeCategoryGrid'
import { MustReadSection } from '@/components/home/MustReadSection'
import { useHomeFeedInfinite } from '@/hooks/useHomeFeedInfinite'
import { buildMagazineStream } from '@/lib/home/magazineStream'
import {
  collectHomeStoryCandidates,
  groupNewsBySource,
} from '@/lib/home/sourceStories'
import type { NaEvent } from '@/types/event'
import type { HomeCategorySlug, HomeFeedInitialData } from '@/types/newsItem'

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
  const { latest, featured, categoryRails, mostRead } = data

  const storyGroups = useMemo(
    () =>
      groupNewsBySource(
        collectHomeStoryCandidates({ latest, featured, categoryRails })
      ),
    [latest, featured, categoryRails]
  )

  const { items: moreItems, loadingMore, hasMore, loadMore } = useHomeFeedInfinite(
    latest
  )

  const magazineBlocks = useMemo(
    () =>
      buildMagazineStream({
        items: moreItems,
        rails: categoryRails,
      }),
    [moreItems, categoryRails]
  )

  const lastMagazineIndex = magazineBlocks.reduce(
    (last, block, index) => (block.kind === 'magazine' ? index : last),
    -1
  )

  return (
    <div className="home-feed home-feed--magazine mx-auto w-full pb-6" data-testid="home-magazine-feed">
      <SourceStories groups={storyGroups} />

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
      ) : storyGroups.length === 0 ? (
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

      <div className="mt-8 hidden lg:block" data-testid="home-market-ticker-desktop">
        <MarketTicker />
      </div>
    </div>
  )
}
