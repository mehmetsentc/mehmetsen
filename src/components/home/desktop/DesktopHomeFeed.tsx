'use client'

import { useMemo } from 'react'
import { ROUTES } from '@/constants/routes'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopCategoryColumn } from '@/components/home/desktop/DesktopCategoryColumn'
import { DesktopHomeFooter } from '@/components/home/desktop/DesktopHomeFooter'
import { DesktopMustWatch } from '@/components/home/desktop/DesktopMustWatch'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import {
  DualImageStory,
  HeroStory,
  ImageStory,
  NumberedStory,
  SidebarTextStory,
  TextLeadStory,
} from '@/components/home/desktop/DesktopStoryBlocks'
import { createFeedAllocator } from '@/components/home/desktop/useFeedPool'
import type { HomeFeedInitialData } from '@/types/newsItem'

const CATEGORY_ROW_1 = ['spor', 'ekonomi', 'teknoloji', 'dunya'] as const
const CATEGORY_ROW_2 = ['saglik', 'kultur', 'turizm', 'asayis'] as const

interface DesktopHomeFeedProps {
  data: HomeFeedInitialData
}

export function DesktopHomeFeed({ data }: DesktopHomeFeedProps) {
  const layout = useMemo(() => {
    const { take, takeCategory } = createFeedAllocator(data)

    const heroLeft = take(1)[0]
    const heroCenter = take(1)[0]
    const heroSidebar = take(5)

    const moreLead = take(1)[0]
    const moreCenter = take(2)
    const moreRight = take(1)[0]
    const moreGrid = take(3)
    const moreSidebar = take(2)

    const topFour = take(4)
    const featureLead = take(1)[0]
    const featureImage = take(1)[0]

    const catRow1 = CATEGORY_ROW_1.map((id) => ({
      id,
      items: takeCategory(id, 4),
    }))
    const catRow2 = CATEGORY_ROW_2.map((id) => ({
      id,
      items: takeCategory(id, 4),
    }))

    const mostRead = data.mostRead.slice(0, 6)
    const trending = data.trending.slice(0, 8)

    return {
      heroLeft,
      heroCenter,
      heroSidebar,
      moreLead,
      moreCenter,
      moreRight,
      moreGrid,
      moreSidebar,
      topFour,
      featureLead,
      featureImage,
      catRow1,
      catRow2,
      mostRead,
      trending,
    }
  }, [data])

  const hasHero = layout.heroCenter

  return (
    <div className="desktop-home-feed">
      {/* ── Üst reklam ── */}
      <DesktopAdBanner slot="leaderboard-top" size="large" className="mb-8" />

      {/* ── Manşet (BBC hero: sol + merkez + sağ liste) ── */}
      {hasHero ? (
        <section
          className="mb-10 grid grid-cols-12 gap-6 border-b border-[rgb(var(--color-border))] pb-10"
          aria-label="Manşet"
        >
          <div className="col-span-12 lg:col-span-3">
            {layout.heroLeft ? (
              <ImageStory item={layout.heroLeft} aspect="portrait" priority showSummary />
            ) : null}
          </div>

          <div className="col-span-12 lg:col-span-6">
            <HeroStory item={layout.heroCenter!} priority />
          </div>

          <aside className="col-span-12 lg:col-span-3 lg:border-l lg:border-[rgb(var(--color-border))] lg:pl-6">
            {layout.heroSidebar.map((item, i) => (
              <SidebarTextStory key={item.id} item={item} live={i === 0 && !!item.breaking} />
            ))}
          </aside>
        </section>
      ) : null}

      {/* ── 4'lü öne çıkan grid ── */}
      {layout.topFour.length > 0 ? (
        <section className="mb-10 grid grid-cols-4 gap-6 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Öne çıkanlar">
          {layout.topFour.map((item, i) => (
            <ImageStory key={item.id} item={item} priority={i === 0} aspect="video" />
          ))}
        </section>
      ) : null}

      {/* ── Daha fazla haber (asimetrik BBC grid) ── */}
      <DesktopSectionHeader title="Daha Fazla Haber" href={ROUTES.CATEGORY('gundem')} />

      <section className="mb-8 grid grid-cols-12 gap-6" aria-label="Gündem haberleri">
        <div className="col-span-12 lg:col-span-3">
          {layout.moreLead ? <TextLeadStory item={layout.moreLead} size="lg" /> : null}
        </div>
        <div className="col-span-12 lg:col-span-6">
          {layout.moreCenter.length > 0 ? <DualImageStory items={layout.moreCenter} /> : null}
        </div>
        <div className="col-span-12 lg:col-span-3">
          {layout.moreRight ? <ImageStory item={layout.moreRight} aspect="wide" /> : null}
        </div>
      </section>

      <section className="mb-10 grid grid-cols-12 gap-6 border-b border-[rgb(var(--color-border))] pb-10">
        {layout.moreGrid.map((item) => (
          <div key={item.id} className="col-span-12 sm:col-span-6 lg:col-span-3">
            <ImageStory item={item} aspect="video" />
          </div>
        ))}
        <aside className="col-span-12 lg:col-span-3 lg:border-l lg:border-[rgb(var(--color-border))] lg:pl-6">
          {layout.moreSidebar.map((item) => (
            <SidebarTextStory key={item.id} item={item} />
          ))}
        </aside>
      </section>

      {/* ── Orta reklam ── */}
      <DesktopAdBanner slot="leaderboard-mid" className="mb-10" />

      {/* ── Trend / Must Watch (koyu bant) ── */}
      <DesktopMustWatch items={layout.trending} />

      {/* ── Öne çıkan feature (metin + görsel) ── */}
      {layout.featureLead && layout.featureImage ? (
        <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Editoryal">
          <DesktopSectionHeader title="Editoryal Seçki" href={ROUTES.CATEGORY('gundem')} />
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 lg:col-span-5 flex flex-col justify-center">
              <TextLeadStory item={layout.featureLead} size="lg" />
            </div>
            <div className="col-span-12 lg:col-span-7">
              <ImageStory item={layout.featureImage} aspect="wide" showSummary={false} />
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Kategori sütunları (satır 1) ── */}
      <section className="mb-10 grid grid-cols-4 gap-6 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Kategori haberleri">
        {layout.catRow1.map(({ id, items }) =>
          items.length > 0 ? <DesktopCategoryColumn key={id} categoryId={id} items={items} /> : null
        )}
      </section>

      {/* ── Alt reklam ── */}
      <DesktopAdBanner slot="leaderboard-bottom" size="large" className="mb-10" />

      {/* ── Kategori sütunları (satır 2 — Turizm, 3. Sayfa vb.) ── */}
      <section className="mb-10 grid grid-cols-4 gap-6 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Diğer kategoriler">
        {layout.catRow2.map(({ id, items }) =>
          items.length > 0 ? <DesktopCategoryColumn key={id} categoryId={id} items={items} /> : null
        )}
      </section>

      {/* ── Çok okunanlar ── */}
      {layout.mostRead.length > 0 ? (
        <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Çok okunanlar">
          <DesktopSectionHeader title="Çok Okunanlar" />
          <div className="grid grid-cols-2 gap-x-10 gap-y-0">
            {layout.mostRead.map((item, index) => (
              <NumberedStory key={item.id} item={item} rank={index + 1} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Footer ── */}
      <DesktopHomeFooter />
    </div>
  )
}
