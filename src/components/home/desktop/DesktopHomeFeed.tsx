'use client'

import { useMemo } from 'react'
import { ROUTES } from '@/constants/routes'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DESKTOP_SECTION_DIVIDER, FOUR_CARD_GRID, HERO_SPLIT_ASIDE, HERO_SPLIT_MAIN, HERO_SPLIT_SECTION } from '@/components/home/desktop/desktopLayout'
import { DesktopCategoryGridSection } from '@/components/home/desktop/DesktopCategoryGridSection'
import { DesktopMarketSidebar } from '@/components/home/desktop/DesktopMarketSidebar'
import { DesktopMostReadGrid } from '@/components/home/desktop/DesktopMostReadGrid'
import { DesktopMustWatch } from '@/components/home/desktop/DesktopMustWatch'
import { DesktopFeaturedGrid } from '@/components/home/desktop/DesktopFeaturedGrid'
import { GamesRail } from '@/components/home/GamesRail'
import { LazySection } from '@/components/home/LazySection'
import { DesktopNewsletterSignup } from '@/components/home/desktop/DesktopNewsletterSignup'
import { DesktopOpinionStrip } from '@/components/home/desktop/DesktopOpinionStrip'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { DesktopInsideIndex } from '@/components/home/desktop/DesktopInsideIndex'
import { DesktopPortalHome } from '@/components/home/desktop/DesktopPortalHome'
import { CityCinemaEventsStrip } from '@/components/city/CityCinemaEventsStrip'
import {
  HeroImageOnly,
  ImageStory,
  QuickHeadlineStrip,
  RightFeatureStory,
  SidebarTextStory,
  TextLeadStory,
} from '@/components/home/desktop/DesktopStoryBlocks'
import { createFeedAllocator } from '@/components/home/desktop/useFeedPool'
import { useMergedCategoryRails } from '@/hooks/useMergedCategoryRails'
import { pickHomeFeedFeaturedPins } from '@/lib/featuredScope'
import { getHomeFeedCategoryFamily } from '@/constants/config'
import { getCategoryLabel } from '@/lib/newsMapper'
import {
  HOME_CATEGORY_DESKTOP_CARDS,
  HOME_CATEGORY_PORTAL_FETCH,
  HOME_CATEGORY_RAIL_GUNDEM_FETCH,
  HOME_FEED_DESKTOP_LAZY_RAILS,
  HOME_FEATURED_LIMIT,
  type HomeCategorySlug,
  type HomeFeedInitialData,
  type NewsItem,
} from '@/types/newsItem'
import type { NaEvent } from '@/types/event'

const CATEGORY_ROW_1 = ['spor', 'ekonomi', 'teknoloji', 'dunya'] as const
const CATEGORY_ROW_2 = HOME_FEED_DESKTOP_LAZY_RAILS
const PORTAL_CATEGORY_ROW = ['siyaset', 'ekonomi', 'dunya', 'spor', 'teknoloji'] as const
const PORTAL_LAZY_RAILS: HomeCategorySlug[] = [
  ...HOME_FEED_DESKTOP_LAZY_RAILS,
  'siyaset',
  'yasam',
  'yerel-haber',
  'asayis',
  'magazin',
  'egitim',
]

function hasArticleImage(item: NewsItem | null | undefined): item is NewsItem {
  return Boolean(item?.imageUrl?.trim())
}

function uniqueWithImage(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const item of items) {
    if (!hasArticleImage(item) || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

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
  cinemaEvents?: NaEvent[]
  districtName?: string
  sectionTitle?: string
  /**
   * Mid-stream section chrome (e.g. "Gündem", "Spor").
   * Do NOT infer Spor from sectionTitle — category pages also set sectionTitle.
   */
  streamSectionLabel?: string
  streamSectionHref?: string
}

export function DesktopHomeFeed({
  data,
  cityMode = false,
  cityName,
  cinemaEvents = [],
  districtName,
  sectionTitle,
  streamSectionLabel,
  streamSectionHref,
}: DesktopHomeFeedProps) {
  const lazyRailIds: HomeCategorySlug[] = cityMode
    ? (Object.keys(data.categoryRails) as HomeCategorySlug[])
    : PORTAL_LAZY_RAILS

  const categoryRails = useMergedCategoryRails(
    data.categoryRails,
    lazyRailIds,
    cityMode ? 0 : 800,
    cityMode ? 1 : HOME_CATEGORY_PORTAL_FETCH
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
      items: sliceCategoryRail(categoryRails, id, HOME_CATEGORY_DESKTOP_CARDS).filter(hasArticleImage),
    }))
    const catRow2 = (cityMode
      ? Object.keys(categoryRails).slice(4, 8)
      : CATEGORY_ROW_2
    ).map((id) => ({
      id,
      items: sliceCategoryRail(categoryRails, id, HOME_CATEGORY_DESKTOP_CARDS).filter(hasArticleImage),
    }))
    const catRow1Filler = rowGapFiller(catRow1, takeFeatured)
    const catRow2Filler = rowGapFiller(catRow2, takeFeatured)

    const mostRead = data.mostRead.slice(0, 8)
    const trending = data.trending.slice(0, 8)
    const moreList = take(8)

    const featuredSlider = pickHomeFeedFeaturedPins(
      data.featured,
      cityMode,
      HOME_FEATURED_LIMIT
    )

    const opinionItems =
      featuredSlider.length >= 3
        ? featuredSlider.slice(0, 3)
        : data.latest.slice(0, 3)

    const portalHero = uniqueWithImage([...featuredSlider, ...heroPool, ...data.latest]).slice(0, 5)
    const portalHeroIds = new Set(portalHero.map((item) => item.id))
    const portalManset = uniqueWithImage([...featuredSlider, ...heroPool, ...data.latest])
      .filter((item) => !portalHeroIds.has(item.id))
      .slice(0, 5)
    const columnists = uniqueWithImage(
      [...featuredSlider, ...data.latest].filter((item) => item.articleFormat === 'column')
    )
    const usedIds = new Set<string>([...portalHero, ...portalManset].map((item) => item.id))
    const takePortalRail = (source: NewsItem[], count: number, imageLead = true): NewsItem[] => {
      const out: NewsItem[] = []
      const ordered = imageLead ? [...uniqueWithImage(source), ...source] : source
      for (const item of ordered) {
        if (!item?.id || usedIds.has(item.id)) continue
        if (imageLead && out.length === 0 && !hasArticleImage(item)) continue
        usedIds.add(item.id)
        out.push(item)
        if (out.length >= count) break
      }
      return out
    }
    const portalCategories = PORTAL_CATEGORY_ROW.map((id) => ({
      id,
      title: getCategoryLabel(id),
      items: takePortalRail(sliceCategoryRail(categoryRails, id, 16), HOME_CATEGORY_PORTAL_FETCH),
    }))
    const asayisFamily = new Set(getHomeFeedCategoryFamily('asayis'))
    const isAsayisItem = (item: NewsItem) =>
      asayisFamily.has((item.category ?? '').toLowerCase())
    const thirdPageItems = takePortalRail(
      [
        ...sliceCategoryRail(categoryRails, 'asayis', 16),
        ...sliceCategoryRail(categoryRails, 'yerel-haber', 16).filter(isAsayisItem),
      ],
      HOME_CATEGORY_PORTAL_FETCH
    )
    const yerelItems = takePortalRail(
      sliceCategoryRail(categoryRails, 'yerel-haber', 16).filter((item) => !isAsayisItem(item)),
      HOME_CATEGORY_PORTAL_FETCH
    )
    const gundemItems = takePortalRail(
      [...gundemRail, ...data.latest],
      HOME_CATEGORY_PORTAL_FETCH
    )
    const kulturItems = takePortalRail(
      sliceCategoryRail(categoryRails, 'kultur', 16),
      HOME_CATEGORY_PORTAL_FETCH
    )
    const saglikItems = takePortalRail(
      sliceCategoryRail(categoryRails, 'saglik', 16),
      HOME_CATEGORY_PORTAL_FETCH
    )
    const turizmItems = takePortalRail(
      sliceCategoryRail(categoryRails, 'turizm', 16),
      HOME_CATEGORY_PORTAL_FETCH
    )
    const yasamItems = takePortalRail(
      sliceCategoryRail(categoryRails, 'yasam', 16),
      HOME_CATEGORY_PORTAL_FETCH
    )
    const magazinItems = takePortalRail(
      sliceCategoryRail(categoryRails, 'magazin', 16),
      HOME_CATEGORY_PORTAL_FETCH
    )
    const videoItems = takePortalRail(
      [...data.trending, ...data.latest, ...featuredSlider].filter((item) => Boolean(item.videoUrl)),
      HOME_CATEGORY_PORTAL_FETCH
    )
    const videoItem = videoItems[0] ?? null
    const photoItems = takePortalRail(
      [
        ...sliceCategoryRail(categoryRails, 'kultur', 16),
        ...sliceCategoryRail(categoryRails, 'magazin', 16),
      ],
      4
    )

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
      mostRead: uniqueWithImage(mostRead),
      trending: uniqueWithImage(trending),
      moreList,
      opinionItems,
      portalHero,
      portalManset,
      columnists,
      portalCategories,
      videoItem,
      videoItems,
      photoItems,
      gundemItems,
      yerelItems,
      thirdPageItems,
      kulturItems,
      saglikItems,
      turizmItems,
      yasamItems,
      magazinItems,
    }
  }, [data, categoryRails, cityMode])

  const hasHero = layout.heroLead
  const hasHeroAside = layout.heroRight.length > 0
  const sectionHref = streamSectionHref ?? ROUTES.CATEGORY('gundem')
  const streamSectionTitle = streamSectionLabel ?? 'Gündem'

  return (
    <div className="desktop-home-feed">
      <h1 className="sr-only">
        {sectionTitle
          ? `${sectionTitle} — ${cityName ?? 'NaHaber'}`
          : cityMode && cityName
            ? districtName
              ? `${districtName} Haberleri — ${cityName} | NaHaber`
              : `${cityName} Haberleri — NaHaber`
            : 'NaHaber — Türkiye Gündem, Son Dakika ve Güncel Haberler'}
      </h1>

      {cityMode ? (
        <>
          {cityName || districtName || sectionTitle ? (
            <p className="mb-4 text-center text-sm font-bold text-[rgb(var(--color-text-secondary))]">
              {sectionTitle || (districtName ? `${districtName} Haberleri` : `${cityName} Haberleri`)}
            </p>
          ) : null}
          <DesktopAdBanner slot="leaderboard-top" size="large" className="mb-8" />
        </>
      ) : (
        <DesktopPortalHome
          heroSlides={layout.portalHero}
          mansetItems={layout.portalManset}
          columnists={layout.columnists}
          mostRead={layout.mostRead}
          categoryCards={layout.portalCategories}
          videoItem={layout.videoItem}
          videoItems={layout.videoItems}
          photoItems={layout.photoItems}
          gundemItems={layout.gundemItems}
          yerelItems={layout.yerelItems}
          thirdPageItems={layout.thirdPageItems}
          kulturItems={layout.kulturItems}
          saglikItems={layout.saglikItems}
          turizmItems={layout.turizmItems}
          yasamItems={layout.yasamItems}
          magazinItems={layout.magazinItems}
        />
      )}

      {cityMode && layout.featuredSlider.length > 0 ? (
        <div className="mb-8 border-b border-[rgb(var(--color-border))] pb-8">
          <DesktopSectionHeader title="Öne Çıkan" href={sectionHref} />
          <DesktopFeaturedGrid items={layout.featuredSlider} />
        </div>
      ) : null}

      {cityMode && cinemaEvents.length > 0 ? (
        <div className="mb-8 border-b border-[rgb(var(--color-border))] pb-8">
          <CityCinemaEventsStrip
            events={cinemaEvents}
            cityName={cityName}
            variant="desktop"
          />
        </div>
      ) : null}

      {cityMode ? <DesktopSectionHeader title="Haberler" href={sectionHref} /> : null}

      {cityMode && hasHero ? (
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

      {cityMode && layout.mostRead.length > 0 ? <DesktopMostReadGrid items={layout.mostRead} /> : null}

      {cityMode && layout.topFour.length > 0 ? (
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

      {cityMode ? <QuickHeadlineStrip items={layout.quickHeadlines} /> : null}

      {cityMode && layout.moreGrid.length > 0 ? (
        <section className={DESKTOP_SECTION_DIVIDER} aria-label={streamSectionTitle}>
          <DesktopSectionHeader title={streamSectionTitle} href={sectionHref} />
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

      {cityMode ? <DesktopAdBanner slot="leaderboard-mid" className="mb-10" /> : null}

      {cityMode ? <DesktopMustWatch items={layout.trending} /> : null}

      {cityMode ? (
        <LazySection minHeight={240}>
          <GamesRail variant="desktop" />
        </LazySection>
      ) : null}

      {cityMode ? <DesktopOpinionStrip items={layout.opinionItems} /> : null}

      {cityMode && layout.featureLead && layout.featureImage ? (
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

      {cityMode
        ? layout.catRow1
            .filter(({ items }) => items.length > 0)
            .map(({ id, items }) => (
              <LazySection key={id} minHeight={320}>
                <DesktopCategoryGridSection
                  categoryId={id}
                  title={getCategoryLabel(id)}
                  items={items}
                />
              </LazySection>
            ))
        : null}

      {cityMode && layout.catRow1Filler.length > 0 ? (
        <LazySection minHeight={320}>
          <DesktopCategoryGridSection
            categoryId="gundem"
            title="Gündemden"
            items={layout.catRow1Filler}
            href={ROUTES.CATEGORY('gundem')}
          />
        </LazySection>
      ) : null}

      {cityMode ? <DesktopAdBanner slot="leaderboard-bottom" size="large" className="mb-10" /> : null}

      {cityMode
        ? layout.catRow2
            .filter(({ items }) => items.length > 0)
            .map(({ id, items }) => (
              <LazySection key={id} minHeight={320}>
                <DesktopCategoryGridSection
                  categoryId={id}
                  title={getCategoryLabel(id)}
                  items={items}
                />
              </LazySection>
            ))
        : null}

      {cityMode && layout.catRow2Filler.length > 0 ? (
        <LazySection minHeight={320}>
          <DesktopCategoryGridSection
            categoryId="gundem"
            title="Daha Fazla"
            items={layout.catRow2Filler}
            href={ROUTES.CATEGORY('gundem')}
          />
        </LazySection>
      ) : null}

      {cityMode ? (
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
