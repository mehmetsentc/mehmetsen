'use client'

import { useMemo } from 'react'
import { BreakingStories } from '@/components/home/BreakingStories'
import { FeaturedSlider } from '@/components/home/FeaturedSlider'
import { BreakingTicker } from '@/components/home/BreakingTicker'
import { MarketTicker } from '@/components/home/MarketTicker'
import { NewsFeedList } from '@/components/home/NewsFeedCard'
import { CategoryRail } from '@/components/home/CategoryRail'
import { MustReadSection } from '@/components/home/MustReadSection'
import { LocalNewsSection } from '@/components/home/LocalNewsSection'
import { LocationPermission } from '@/components/home/LocationPermission'
import { getCategoryLabel } from '@/lib/newsMapper'
import { HOME_CATEGORY_RAILS, type HomeFeedInitialData } from '@/types/newsItem'

interface HomeFeedProps {
  data: HomeFeedInitialData
}

export function HomeFeed({ data }: HomeFeedProps) {
  const { breaking, featured, latest, mostRead, categoryRails } = data

  const feedHead = useMemo(() => latest.slice(0, 6), [latest])
  const feedTail = useMemo(() => latest.slice(6), [latest])

  return (
    <div className="home-feed mx-auto w-full max-w-3xl pb-6">
      <LocationPermission />

      <BreakingStories items={breaking} />
      <FeaturedSlider items={featured} />
      <BreakingTicker items={breaking} />
      <MarketTicker />

      <section className="home-section" aria-label="Son haberler">
        <div className="home-rail-title">
          <span className="home-rail-accent" aria-hidden />
          <h2 className="text-lg font-black text-[rgb(var(--color-text))]">Akış</h2>
        </div>
        <NewsFeedList items={feedHead} />
      </section>

      <MustReadSection items={mostRead} />

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

      {feedTail.length > 0 ? (
        <section className="home-section" aria-label="Daha fazla haber">
          <NewsFeedList items={feedTail} />
        </section>
      ) : null}
    </div>
  )
}
