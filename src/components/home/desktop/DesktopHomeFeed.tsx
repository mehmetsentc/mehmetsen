'use client'

import { useMemo } from 'react'
import { ROUTES } from '@/constants/routes'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DESKTOP_SECTION_DIVIDER, FOUR_CARD_GRID, HERO_SPLIT_ASIDE, HERO_SPLIT_MAIN, HERO_SPLIT_SECTION } from '@/components/home/desktop/desktopLayout'
import { DesktopCategoryGridSection } from '@/components/home/desktop/DesktopCategoryGridSection'
import { DesktopMarketSidebar } from '@/components/home/desktop/DesktopMarketSidebar'
import { DesktopMoreGridChunks } from '@/components/home/desktop/DesktopMoreGridChunks'
import { DesktopMostReadGrid } from '@/components/home/desktop/DesktopMostReadGrid'
import { DesktopMustWatch } from '@/components/home/desktop/DesktopMustWatch'
import { DesktopFeaturedGrid } from '@/components/home/desktop/DesktopFeaturedGrid'
import { GamesRail } from '@/components/home/GamesRail'
import { LazySection } from '@/components/home/LazySection'
import { DesktopNewsletterSignup } from '@/components/home/desktop/DesktopNewsletterSignup'
import { DesktopOpinionStrip } from '@/components/home/desktop/DesktopOpinionStrip'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { NewspaperMasthead } from '@/components/home/desktop/NewspaperMasthead'
import { DesktopInsideIndex } from '@/components/home/desktop/DesktopInsideIndex'
import {
  HeroImageOnly,
  ImageStory,
  QuickHeadlineStrip,
  RightFeatureStory,
  SidebarTextStory,
  TextLeadStory,
} from '@/components/home/desktop/DesktopStoryBlocks'
import { createFeedAllocator } from '@/components/home/desktop/useFeedPool'
import { useHomeFeedInfinite } from '@/hooks/useHomeFeedInfinite'
import { useMergedCategoryRails } from '@/hooks/useMergedCategoryRails'
import { getCategoryLabel } from '@/lib/newsMapper'
import {
  HOME_CATEGORY_DESKTOP_CARDS,
  HOME_CATEGORY_RAIL_GUNDEM_FETCH,
  HOME_FEED_DESKTOP_LAZY_RAILS,
  HOME_FEATURED_LIMIT,
  type HomeCategorySlug,
  type HomeFeedInitialData,
  type NewsItem,
} from '@/types/newsItem'

const CATEGORY_ROW_1 = ['spor', 'ekonomi', 'teknoloji', 'dunya'] as const
const CATEGORY_ROW_2 = HOME_FEED_DESKTOP_LAZY_RAILS

function sliceCategoryRail(
  rails: HomeFeedInitialData['categoryRails'],
  categoryId: string,
  count: number
): NewsItem[] {
  return (rails[categoryId as HomeCategorySlug] ?? []).slice(0, count)
}

function rowGapFiller(
  rows: { id: string; items: NewsItem[] }[],
  takeFeatured: (count: number) => NewsItem[]
): NewsItem[] {
  const emptySlots = rows.filter((row) => row.items.length === 0).length
  if (emptySlots === 0 || rows.every((row) => row.items.length === 0)) return []
  return takeFeatured(4)
}

interface DesktopHomeFeedProps {
  data: HomeFeedInitialData
  cityMode?: boolean
  cityName?: string
}

export function DesktopHomeFeed({ data, cityMode = false, cityName }: DesktopHomeFeedProps) {
  const lazyRailIds = cityMode
    ? (Object.keys(data.categoryRails) as HomeCategorySlug[])
    : HOME_FEED_DESKTOP_LAZY_RAILS

  const categoryRails = useMergedCategoryRails(
    data.categoryRails,
    lazyRailIds,
    cityMode ? 0 : 1200
  )

  const layout = useMemo(() => {
    const feedData = { ...data, categoryRails }
    const { take, takeFeatured } = createFeedAllocator(feedData)

    const primaryRail =
      categoryRails.gundem ??
      categoryRails.asayis ??
      data.latest
    const gundemRail = Array.isArray(primaryRail) ? primaryRail : []
    const heroPool =
      cityMode && gundemRail.length < 4
        ? [
            ...gundemRail,
            ...data.featured.filter((item) => !gundemRail.some((g) => g.id === item.id)),
            ...data.latest.filter((item) => !gundemRail.some((g) => g.id === item.id)),
          ].slice(0, HOME_CATEGORY_RAIL_GUNDEM_FETCH)
        : gundemRail
    const heroLead = heroPool[0]
    const heroRight = heroPool.slice(1, 4)

    const topFour = heroPool.slice(4, 8)
    const quickHeadlines = heroPool.slice(8, 13)
    const moreGrid = heroPool.slice(13, 17)
    const moreSidebar = heroPool.slice(17, 19)

    const featureLead = take(1)[0]
    const featureImage = take(1)[0]

    const catRow1 = (cityMode
      ? Object.keys(categoryRails).slice(0, 4)
      : CATEGORY_ROW_1
    ).map((id) => ({
      id,
      items: sliceCategoryRail(categoryRails, id, HOME_CATEGORY_DESKTOP_CARDS),
    }))
    const catRow2 = (cityMode
      ? Object.keys(categoryRails).slice(4, 8)
      : CATEGORY_ROW_2
    ).map((id) => ({
      id,
      items: sliceCategoryRail(categoryRails, id, HOME_CATEGORY_DESKTOP_CARDS),
    }))
    const catRow1Filler = rowGapFiller(catRow1, takeFeatured)
    const catRow2Filler = rowGapFiller(catRow2, takeFeatured)

    const mostRead = data.mostRead.slice(0, 8)
    const trending = data.trending.slice(0, 8)
    const moreList = take(8)

    const featuredSlider = (cityMode
      ? data.featured
      : data.featured.filter((p) => p.featured === true)
    ).slice(0, HOME_FEATURED_LIMIT)

    const opinionItems =
      featuredSlider.length >= 3
        ? featuredSlider.slice(0, 3)
        : data.latest.slice(0, 3)

    const lastUpdated = data.latest[0]?.publishedAt ?? data.latest[0]?.createdAt

    return {
      featuredSlider,
      heroLead,
      heroRight,
      topFour,
      quickHeadlines,
      moreGrid,
      moreSidebar,
      featureLead,
      featureImage,
      catRow1,
      catRow2,
      catRow1Filler,
      catRow2Filler,
      mostRead,
      trending,
      moreList,
      opinionItems,
      lastUpdated,
    }
  }, [data, categoryRails, cityMode])

  const { items: moreItems, loadingMore, hasMore, loadMore } = useHomeFeedInfinite(
    cityMode ? [] : layout.moreList
  )
  const hasHero = layout.heroLead
  const hasHeroAside = layout.heroRight.length > 0

  return (
    <div className="desktop-home-feed">
      <h1 className="sr-only">
        {cityMode && cityName
          ? `${cityName} Haberleri — NaHaber`
          : 'NaHaber — Türkiye Gündem, Son Dakika ve Güncel Haberler'}
      </h1>

      <NewspaperMasthead lastUpdated={layout.lastUpdated} cityName={cityName} />

      <DesktopAdBanner slot="leaderboard-top" size="large" className="mb-8" />

      {layout.featuredSlider.length > 0 ? (
        <div className="mb-8 border-b border-[rgb(var(--color-border))] pb-8">
          <DesktopSectionHeader title="Öne Çıkan" href={ROUTES.CATEGORY('gundem')} />
          <DesktopFeaturedGrid items={layout.featuredSlider} />
        </div>
      ) : null}

      <DesktopSectionHeader title="Haberler" href={ROUTES.CATEGORY('gundem')} />

      {hasHero ? (
        <section
          className={`mb-10 ${HERO_SPLIT_SECTION} border-b border-[rgb(var(--color-border))] pb-10`}
          aria-label="Manşet"
        >
          <div className={hasHeroAside ? HERO_SPLIT_MAIN : 'col-span-12 min-w-0'}>
            <HeroImageOnly item={layout.heroLead!} priority aspect="wide" />
            <div className="mt-4">
              <TextLeadStory item={layout.heroLead!} size="hero" dropCap />
            </div>
          </div>

          {hasHeroAside ? (
            <aside className={HERO_SPLIT_ASIDE}>
              <p className="nl-kicker mb-3">Öne Çıkanlar</p>
              <div className="nl-kicker-bar">
                <div className="flex min-w-0 flex-1 flex-col">
                  {layout.heroRight.map((item, i) => (
                    <RightFeatureStory key={item.id} item={item} live={i === 0 && !!item.breaking} />
                  ))}
                </div>
              </div>
            </aside>
          ) : null}
        </section>
      ) : null}

      {layout.mostRead.length > 0 ? <DesktopMostReadGrid items={layout.mostRead} /> : null}

      {layout.topFour.length > 0 ? (
        <section className={`mb-6 ${HERO_SPLIT_SECTION}`} aria-label="Öne çıkanlar">
          <div className={HERO_SPLIT_MAIN}>
            <div className="grid grid-cols-2 gap-4">
              {layout.topFour.map((item) => (
                <ImageStory key={item.id} item={item} aspect="video" />
              ))}
            </div>
          </div>
          <aside className={HERO_SPLIT_ASIDE}>
            <DesktopMarketSidebar />
          </aside>
        </section>
      ) : null}

      <QuickHeadlineStrip items={layout.quickHeadlines} />

      {layout.moreGrid.length > 0 ? (
        <section className={DESKTOP_SECTION_DIVIDER} aria-label="Gündem">
          <DesktopSectionHeader title="Gündem" href={ROUTES.CATEGORY('gundem')} />
          <div className={FOUR_CARD_GRID}>
            {layout.moreGrid.map((item) => (
              <ImageStory key={item.id} item={item} aspect="video" />
            ))}
          </div>
          {layout.moreSidebar.length > 0 ? (
            <aside
              className="mt-6 grid grid-cols-1 gap-x-6 border-t border-[rgb(var(--color-border))] pt-6 sm:grid-cols-2"
              aria-label="Gündem yan haberler"
            >
              {layout.moreSidebar.map((item) => (
                <SidebarTextStory key={item.id} item={item} />
              ))}
            </aside>
          ) : null}
        </section>
      ) : null}

      <DesktopAdBanner slot="leaderboard-mid" className="mb-10" />

      <DesktopMustWatch items={layout.trending} />

      {!cityMode ? (
        <LazySection minHeight={240}>
          <GamesRail variant="desktop" />
        </LazySection>
      ) : null}

      <DesktopOpinionStrip items={layout.opinionItems} />

      {layout.featureLead && layout.featureImage ? (
        <section className={DESKTOP_SECTION_DIVIDER} aria-label="Editoryal">
          <DesktopSectionHeader title="Editoryal Seçki" href={ROUTES.CATEGORY('gundem')} />
          <div className="grid grid-cols-12 items-start gap-4">
            <div className="col-span-12 min-w-0 lg:col-span-6">
              <TextLeadStory item={layout.featureLead} size="lg" dropCap />
            </div>
            <div className="col-span-12 min-w-0 lg:col-span-6">
              <ImageStory item={layout.featureImage} aspect="wide" showSummary={false} />
            </div>
          </div>
        </section>
      ) : null}

      {layout.catRow1
        .filter(({ items }) => items.length > 0)
        .map(({ id, items }) => (
          <LazySection key={id} minHeight={320}>
            <DesktopCategoryGridSection
              categoryId={id}
              title={getCategoryLabel(id)}
              items={items}
            />
          </LazySection>
        ))}

      {layout.catRow1Filler.length > 0 ? (
        <LazySection minHeight={320}>
          <DesktopCategoryGridSection
            categoryId="gundem"
            title="Gündemden"
            items={layout.catRow1Filler}
            href={ROUTES.CATEGORY('gundem')}
          />
        </LazySection>
      ) : null}

      <DesktopAdBanner slot="leaderboard-bottom" size="large" className="mb-10" />

      {layout.catRow2
        .filter(({ items }) => items.length > 0)
        .map(({ id, items }) => (
          <LazySection key={id} minHeight={320}>
            <DesktopCategoryGridSection
              categoryId={id}
              title={getCategoryLabel(id)}
              items={items}
            />
          </LazySection>
        ))}

      {layout.catRow2Filler.length > 0 ? (
        <LazySection minHeight={320}>
          <DesktopCategoryGridSection
            categoryId="gundem"
            title="Daha Fazla"
            items={layout.catRow2Filler}
            href={ROUTES.CATEGORY('gundem')}
          />
        </LazySection>
      ) : null}

      {!cityMode ? (
        <DesktopMoreGridChunks
          items={moreItems}
          title="Daha Fazla"
          href={ROUTES.CATEGORY('gundem')}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={() => void loadMore()}
        />
      ) : null}

      {!cityMode ? (
        <section
          className="mt-10 grid grid-cols-1 gap-6 border-t border-[rgb(var(--color-border))] pt-8 lg:grid-cols-12"
          aria-label="Dizin ve abonelik"
        >
          <div className="lg:col-span-5">
            <DesktopInsideIndex />
          </div>
          <div className="lg:col-span-7">
            <DesktopNewsletterSignup />
          </div>
        </section>
      ) : null}
    </div>
  )
}
