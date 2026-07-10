'use client'

import { useMemo } from 'react'
import { ROUTES } from '@/constants/routes'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DESKTOP_SECTION_DIVIDER, FOUR_CARD_GRID } from '@/components/home/desktop/desktopLayout'
import { DesktopCategoryGridSection } from '@/components/home/desktop/DesktopCategoryGridSection'
import { DesktopHomeFooter } from '@/components/home/desktop/DesktopHomeFooter'
import { DesktopMoreGridChunks } from '@/components/home/desktop/DesktopMoreGridChunks'
import { DesktopMustWatch } from '@/components/home/desktop/DesktopMustWatch'
import { DesktopNewsletterSignup } from '@/components/home/desktop/DesktopNewsletterSignup'
import { DesktopOpinionStrip } from '@/components/home/desktop/DesktopOpinionStrip'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { NewspaperMasthead } from '@/components/home/desktop/NewspaperMasthead'
import { OnThisDayArchive } from '@/components/home/OnThisDayArchive'
import {
  HeroImageOnly,
  ImageStory,
  NumberedStory,
  QuickHeadlineStrip,
  RightFeatureStory,
  SidebarTextStory,
  TextLeadStory,
} from '@/components/home/desktop/DesktopStoryBlocks'
import { createFeedAllocator } from '@/components/home/desktop/useFeedPool'
import { useHomeFeedInfinite } from '@/hooks/useHomeFeedInfinite'
import { getCategoryLabel } from '@/lib/newsMapper'
import type { HomeCategorySlug, HomeFeedInitialData, NewsItem } from '@/types/newsItem'

const CATEGORY_ROW_1 = ['spor', 'ekonomi', 'teknoloji', 'dunya'] as const
const CATEGORY_ROW_2 = ['saglik', 'kultur', 'turizm', 'gezi'] as const

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
}

export function DesktopHomeFeed({ data }: DesktopHomeFeedProps) {
  const layout = useMemo(() => {
    const { take, takeFeatured } = createFeedAllocator(data)

    const heroLead = take(1)[0]
    const heroRight = take(2)
    const heroSidebarText = take(3)

    const topFour = take(4)
    const quickHeadlines = take(5)

    const moreGrid = sliceCategoryRail(data.categoryRails, 'gundem', 4)
    const moreSidebar = sliceCategoryRail(data.categoryRails, 'gundem', 6).slice(4, 6)

    const featureLead = take(1)[0]
    const featureImage = take(1)[0]

    const catRow1 = CATEGORY_ROW_1.map((id) => ({
      id,
      items: sliceCategoryRail(data.categoryRails, id, 4),
    }))
    const catRow2 = CATEGORY_ROW_2.map((id) => ({
      id,
      items: sliceCategoryRail(data.categoryRails, id, 4),
    }))
    const catRow1Filler = rowGapFiller(catRow1, takeFeatured)
    const catRow2Filler = rowGapFiller(catRow2, takeFeatured)

    const mostRead = data.mostRead.slice(0, 6)
    const trending = data.trending.slice(0, 8)
    const moreList = take(8)

    const opinionItems = data.featured.slice(0, 3).length >= 3
      ? data.featured.slice(0, 3)
      : data.latest.slice(0, 3)

    const lastUpdated = data.latest[0]?.publishedAt ?? data.latest[0]?.createdAt

    return {
      heroLead,
      heroRight,
      heroSidebarText,
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
  }, [data])

  const { items: moreItems, loadingMore, sentinelRef } = useHomeFeedInfinite(layout.moreList)
  const hasHero = layout.heroLead

  return (
    <div className="desktop-home-feed">
      <h1 className="sr-only">NaHaber — Türkiye Gündem, Son Dakika ve Güncel Haberler</h1>

      <NewspaperMasthead lastUpdated={layout.lastUpdated} />

      <DesktopAdBanner slot="leaderboard-top" size="large" className="mb-8" />

      <DesktopSectionHeader title="Haberler" href={ROUTES.CATEGORY('gundem')} />

      {hasHero ? (
        <section
          className="mb-10 grid grid-cols-12 items-start gap-4 border-b border-[rgb(var(--color-border))] pb-10"
          aria-label="Manşet"
        >
          <div className="col-span-12 min-w-0 lg:col-span-6">
            <HeroImageOnly item={layout.heroLead!} priority aspect="wide" />
            <div className="mt-4">
              <TextLeadStory item={layout.heroLead!} size="hero" />
            </div>
          </div>

          <aside className="col-span-12 min-w-0 lg:col-span-6 lg:border-l lg:border-[rgb(var(--color-border))] lg:pl-5">
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {layout.heroRight.map((item, i) => (
                <RightFeatureStory key={item.id} item={item} live={i === 0 && !!item.breaking} />
              ))}
              {layout.heroSidebarText.map((item) => (
                <SidebarTextStory key={item.id} item={item} />
              ))}
            </div>
          </aside>
        </section>
      ) : null}

      {layout.topFour.length > 0 ? (
        <section className={`mb-6 ${FOUR_CARD_GRID}`} aria-label="Öne çıkanlar">
          {layout.topFour.map((item, i) => (
            <ImageStory key={item.id} item={item} priority={i === 0} aspect="video" />
          ))}
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

      <DesktopOpinionStrip items={layout.opinionItems} />

      {layout.featureLead && layout.featureImage ? (
        <section className={DESKTOP_SECTION_DIVIDER} aria-label="Editoryal">
          <DesktopSectionHeader title="Editoryal Seçki" href={ROUTES.CATEGORY('gundem')} />
          <div className="grid grid-cols-12 items-start gap-4">
            <div className="col-span-12 min-w-0 lg:col-span-6">
              <TextLeadStory item={layout.featureLead} size="lg" />
            </div>
            <div className="col-span-12 min-w-0 lg:col-span-6">
              <ImageStory item={layout.featureImage} aspect="wide" showSummary={false} priority />
            </div>
          </div>
        </section>
      ) : null}

      {layout.catRow1
        .filter(({ items }) => items.length > 0)
        .map(({ id, items }) => (
          <DesktopCategoryGridSection
            key={id}
            categoryId={id}
            title={getCategoryLabel(id)}
            items={items}
          />
        ))}

      {layout.catRow1Filler.length > 0 ? (
        <DesktopCategoryGridSection
          categoryId="gundem"
          title="Öne Çıkan"
          items={layout.catRow1Filler}
          href={ROUTES.CATEGORY('gundem')}
        />
      ) : null}

      <OnThisDayArchive />

      <DesktopAdBanner slot="leaderboard-bottom" size="large" className="mb-10" />

      {layout.catRow2
        .filter(({ items }) => items.length > 0)
        .map(({ id, items }) => (
          <DesktopCategoryGridSection
            key={id}
            categoryId={id}
            title={getCategoryLabel(id)}
            items={items}
          />
        ))}

      {layout.catRow2Filler.length > 0 ? (
        <DesktopCategoryGridSection
          categoryId="gundem"
          title="Öne Çıkan"
          items={layout.catRow2Filler}
          href={ROUTES.CATEGORY('gundem')}
        />
      ) : null}

      {layout.mostRead.length > 0 ? (
        <section className={DESKTOP_SECTION_DIVIDER} aria-label="Çok okunanlar">
          <DesktopSectionHeader title="Çok Okunanlar" />
          <div className="grid grid-cols-2 gap-x-10 gap-y-0">
            {layout.mostRead.map((item, index) => (
              <NumberedStory key={item.id} item={item} rank={index + 1} />
            ))}
          </div>
        </section>
      ) : null}

      <DesktopMoreGridChunks
        items={moreItems}
        title="Daha Fazla"
        href={ROUTES.CATEGORY('gundem')}
        loadingMore={loadingMore}
        sentinelRef={sentinelRef}
      />

      <div className="xl:hidden">
        <DesktopNewsletterSignup />
      </div>

      <DesktopHomeFooter />
    </div>
  )
}
