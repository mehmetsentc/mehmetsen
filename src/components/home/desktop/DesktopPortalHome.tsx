'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Mail, Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup'
import { DesktopPortalPulse } from '@/components/home/desktop/DesktopPortalPulse'
import { CityCinemaEventsStrip } from '@/components/city/CityCinemaEventsStrip'
import { CityNewspaperServiceCards } from '@/components/city/CityNewspaperServiceCards'
import { useCityTenant } from '@/store/cityTenantContext'
import { formatNewsClockTime } from '@/components/home/desktop/formatNewsDate'
import type { NaEvent } from '@/types/event'
import { getCategoryAccentColor } from '@/lib/categoryAccent'
import { packNewspaperCategoryLayout } from '@/lib/cityPortalHome'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

const PORTAL_CATEGORY_ACCENTS: Record<string, string> = {
  siyaset: '#2563EB',
  ekonomi: '#7C3AED',
  dunya: '#059669',
  spor: '#16A34A',
  teknoloji: '#EA580C',
}

type NewsWithImage = NewsItem & { imageUrl: string }

function hasImage(item: NewsItem): item is NewsWithImage {
  return Boolean(item.imageUrl?.trim())
}

function withImage(items: NewsItem[]): NewsWithImage[] {
  return items.filter(hasImage)
}

function PortalBandHead({
  title,
  href,
  more,
}: {
  title: string
  href: string
  more: string
}) {
  return (
    <div className="desktop-portal-bottom__head">
      <h2 className="desktop-portal-kicker">{title}</h2>
      <Link href={href} className="desktop-portal-more">
        {more}
      </Link>
    </div>
  )
}

function PortalTile({ item, sizes = '240px' }: { item: NewsWithImage; sizes?: string }) {
  return (
    <article className="desktop-portal-tile">
      <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__media">
        <SafeNewsImage src={item.imageUrl} alt="" fill sizes={sizes} className="object-cover" />
      </Link>
      <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__title">
        {item.title}
      </Link>
      {item.summary || item.description ? (
        <p className="desktop-portal-cat__dek">{item.summary || item.description}</p>
      ) : null}
    </article>
  )
}

function categoryHref(id: string) {
  if (id === 'yerel') return ROUTES.CATEGORY('yerel-haber')
  if (id === 'asayis') return ROUTES.CATEGORY('asayis')
  return ROUTES.CATEGORY(id)
}

const MIN_COLUMN_ITEMS = 3
const MIN_RAIL_ITEMS = 4

function isFilledColumn(items: NewsItem[]) {
  return items.length >= MIN_COLUMN_ITEMS && items.some((item) => Boolean(item.imageUrl?.trim()))
}

function isFilledRail(items: NewsItem[]) {
  return items.length >= MIN_RAIL_ITEMS && items.some((item) => Boolean(item.imageUrl?.trim()))
}

function PortalScrollRail({
  title,
  href,
  items,
}: {
  title: string
  href: string
  items: NewsItem[]
}) {
  const tiles = withImage(items).slice(0, 4)
  if (tiles.length < MIN_RAIL_ITEMS) return null
  return (
    <section className="desktop-portal-band" aria-label={title}>
      <PortalBandHead title={title} href={href} more="Tümü" />
      <div className="desktop-portal-grid-4">
        {tiles.map((item) => (
          <PortalTile key={item.id} item={item} sizes="240px" />
        ))}
      </div>
    </section>
  )
}

function PortalLeadColumn({
  title,
  href,
  accent,
  items,
}: {
  title: string
  href: string
  accent: string
  items: NewsItem[]
}) {
  const imaged = withImage(items)
  const lead = imaged[0]
  const rest = items.filter((item) => item.id !== lead?.id).slice(0, 9)
  if (!lead && rest.length === 0) return null

  return (
    <article className="desktop-portal-cat" style={{ borderTopColor: accent }}>
      <Link href={href} className="desktop-portal-cat__kicker" style={{ color: accent }}>
        {title}
      </Link>
      {lead ? (
        <>
          <Link href={newsItemDetailHref(lead)} className="desktop-portal-cat__media">
            <SafeNewsImage src={lead.imageUrl} alt="" fill sizes="360px" className="object-cover" />
          </Link>
          <Link href={newsItemDetailHref(lead)} className="desktop-portal-cat__title">
            {lead.title}
          </Link>
        </>
      ) : null}
      {rest.length > 0 ? (
        <ul className="desktop-portal-extra desktop-portal-scroll">
          {rest.map((item) => (
            <li key={item.id}>
              <Link href={newsItemDetailHref(item)}>{item.title}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

export function DesktopPortalHome({
  heroSlides,
  mansetItems,
  columnists,
  mostRead,
  categoryCards,
  videoItem,
  photoItems: _photoItems,
  gundemItems = [],
  yerelItems = [],
  thirdPageItems = [],
  videoItems = [],
  kulturItems = [],
  saglikItems = [],
  turizmItems = [],
  yasamItems = [],
  magazinItems = [],
  egitimItems = [],
  cinemaEvents = [],
  cityName,
}: {
  heroSlides: NewsItem[]
  mansetItems: NewsItem[]
  columnists: NewsItem[]
  mostRead: NewsItem[]
  categoryCards: { id: string; title: string; items: NewsItem[] }[]
  videoItem: NewsItem | null
  photoItems: NewsItem[]
  gundemItems?: NewsItem[]
  yerelItems?: NewsItem[]
  thirdPageItems?: NewsItem[]
  videoItems?: NewsItem[]
  kulturItems?: NewsItem[]
  saglikItems?: NewsItem[]
  turizmItems?: NewsItem[]
  yasamItems?: NewsItem[]
  magazinItems?: NewsItem[]
  egitimItems?: NewsItem[]
  cinemaEvents?: NaEvent[]
  cityName?: string
}) {
  const cityTenant = useCityTenant()
  const citySlug = cityTenant?.provinceSlug
  const slides = withImage(heroSlides).slice(0, 5)
  const [active, setActive] = useState(0)
  const hero = slides[active] ?? slides[0]
  const isColumnists = columnists.length > 0
  const railItems = withImage(isColumnists ? columnists : mostRead).slice(0, 8)
  const railTitle = isColumnists ? 'Yazarlar' : 'En çok okunan'
  const manset = withImage(mansetItems).slice(0, 8)
  const gundem = withImage(gundemItems).slice(0, 10)
  const yerel = yerelItems.slice(0, 10)
  const thirdPage = thirdPageItems.slice(0, 10)
  const videos = withImage(videoItems.length > 0 ? videoItems : videoItem ? [videoItem] : []).slice(
    0,
    10
  )
  const kultur = kulturItems.slice(0, 10)
  const saglik = saglikItems.slice(0, 10)
  const turizm = turizmItems.slice(0, 10)
  const yasam = yasamItems.slice(0, 10)
  const magazin = magazinItems.slice(0, 10)
  const egitim = egitimItems.slice(0, 10)
  const cats = categoryCards.filter((card) => isFilledColumn(card.items))
  const fillRails = [
    { id: 'kultur', title: 'Kültür', items: kultur },
    { id: 'saglik', title: 'Sağlık', items: saglik },
    { id: 'yasam', title: 'Yaşam', items: yasam },
    { id: 'turizm', title: 'Turizm', items: turizm },
    { id: 'egitim', title: 'Eğitim', items: egitim },
    { id: 'gundem', title: 'Gündem', items: gundem },
    { id: 'magazin', title: 'Magazin', items: magazin },
    { id: 'asayis', title: '3. Sayfa', items: thirdPage },
    { id: 'yerel', title: 'Yerel', items: yerel },
  ].filter((card) => isFilledColumn(card.items) && !cats.some((col) => col.id === card.id))
  const packed = packNewspaperCategoryLayout(cats, fillRails)
  const leftoverGridRaw = packed.leftoverGrid.filter((card) => isFilledColumn(card.items))
  const leftoverGrid = leftoverGridRaw.length >= 2 ? leftoverGridRaw : []
  const leftoverRails = [
    ...packed.leftoverRails,
    ...(leftoverGridRaw.length === 1 ? leftoverGridRaw : []),
  ].filter((card) => withImage(card.items).length >= MIN_RAIL_ITEMS)

  const go = useCallback(
    (dir: -1 | 1) => {
      if (slides.length <= 1) return
      setActive((current) => (current + dir + slides.length) % slides.length)
    },
    [slides.length]
  )

  return (
    <div
      className="desktop-portal-home"
      data-testid="desktop-portal-home"
      data-portal-rev="events-end-20260920"
      data-gundem-count={gundem.length}
      data-yerel-count={yerel.length}
      data-third-count={thirdPage.length}
    >
      <section className="desktop-portal-stage" aria-label="Manşet">
        <aside className="desktop-portal-manset" aria-label="Günün manşetleri">
          <h2 className="desktop-portal-kicker">Günün manşetleri</h2>
          <ul className="desktop-portal-manset__list">
            {manset.map((item) => {
              const clock = formatNewsClockTime(item.publishedAt ?? item.createdAt)
              return (
                <li key={item.id}>
                  <Link href={newsItemDetailHref(item)} className="desktop-portal-manset__row">
                    <span className="desktop-portal-manset__thumb">
                      <SafeNewsImage
                        src={item.imageUrl}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </span>
                    {clock ? <span className="desktop-portal-manset__time">{clock}</span> : null}
                    <span className="desktop-portal-manset__title">{item.title}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </aside>

        {hero ? (
          <article className="desktop-portal-hero">
            <div className="desktop-portal-hero__media">
              <SafeNewsImage
                src={hero.imageUrl}
                alt={hero.title}
                fill
                priority
                sizes="(min-width: 1280px) 640px, 50vw"
                className="object-cover"
              />
              <div className="desktop-portal-hero__shade" />
              {slides.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="desktop-portal-hero__arrow desktop-portal-hero__arrow--prev"
                    onClick={() => go(-1)}
                    aria-label="Önceki manşet"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="desktop-portal-hero__arrow desktop-portal-hero__arrow--next"
                    onClick={() => go(1)}
                    aria-label="Sonraki manşet"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              ) : null}
              <div className="desktop-portal-hero__copy">
                {newsItemCategoryLabel(hero) ? (
                  <span className="desktop-portal-hero__cat">{newsItemCategoryLabel(hero)}</span>
                ) : null}
                <Link href={newsItemDetailHref(hero)} className="desktop-portal-hero__title">
                  {hero.seoTitle || hero.title}
                </Link>
                {hero.summary || hero.description ? (
                  <p className="desktop-portal-hero__dek">{hero.summary || hero.description}</p>
                ) : null}
                {slides.length > 1 ? (
                  <div className="desktop-portal-hero__dots">
                    {slides.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        aria-label={`Manşet ${index + 1}`}
                        aria-current={index === active ? 'true' : undefined}
                        className={cn(index === active && 'is-active')}
                        onClick={() => setActive(index)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        ) : null}

        {railItems.length > 0 ? (
          <aside className="desktop-portal-rail" aria-label={railTitle}>
            <div className="desktop-portal-rail__head">
              <h2 className="desktop-portal-kicker">{railTitle}</h2>
            </div>
            <ul className="desktop-portal-rail__list">
              {railItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={newsItemDetailHref(item)}
                    className="desktop-portal-manset__row desktop-portal-manset__row--thumb"
                  >
                    <span className="desktop-portal-manset__thumb">
                      <SafeNewsImage
                        src={item.imageUrl}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </span>
                    <span className="desktop-portal-manset__title">{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </section>

      {citySlug ? (
        <CityNewspaperServiceCards
          citySlug={citySlug}
          cityName={cityName || cityTenant.displayName}
        />
      ) : null}

      {packed.gridCards.length > 0 ? (
        <section className="desktop-portal-cats" aria-label="Kategoriler">
          {packed.gridCards.map((card) => (
            <PortalLeadColumn
              key={card.id}
              title={card.title}
              href={categoryHref(card.id)}
              accent={PORTAL_CATEGORY_ACCENTS[card.id] ?? getCategoryAccentColor(card.id)}
              items={card.items}
            />
          ))}
        </section>
      ) : null}

      {leftoverGrid.length > 0 ? (
        <section
          className="desktop-portal-cats"
          data-cols={leftoverGrid.length}
          aria-label="Kategoriler"
        >
          {leftoverGrid.map((card) => (
            <PortalLeadColumn
              key={card.id}
              title={card.title}
              href={categoryHref(card.id)}
              accent={PORTAL_CATEGORY_ACCENTS[card.id] ?? getCategoryAccentColor(card.id)}
              items={card.items}
            />
          ))}
        </section>
      ) : null}

      {leftoverRails.map((card) => (
        <PortalScrollRail
          key={card.id}
          title={card.title}
          href={categoryHref(card.id)}
          items={card.items}
        />
      ))}

      {citySlug ? null : <DesktopPortalPulse />}

      {videos.length >= MIN_RAIL_ITEMS ? (
        <section className="desktop-portal-band" aria-label="Video">
          <PortalBandHead title="Video" href={ROUTES.VIDEO} more="Tüm videolar" />
          <div className="desktop-portal-grid-4">
            {videos.slice(0, 4).map((item) => (
              <article key={item.id} className="desktop-portal-video-tile">
                <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__media">
                  <SafeNewsImage
                    src={item.imageUrl}
                    alt=""
                    fill
                    sizes="240px"
                    className="object-cover"
                  />
                  <span className="desktop-portal-video__play" aria-hidden>
                    <Play className="h-5 w-5 fill-current" />
                  </span>
                </Link>
                <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__title">
                  {item.title}
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {packed.restRails.filter((card) => isFilledRail(card.items)).map((card) => (
        <PortalScrollRail
          key={card.id}
          title={card.title}
          href={categoryHref(card.id)}
          items={card.items}
        />
      ))}

      {cinemaEvents.length > 0 ? (
        <CityCinemaEventsStrip
          events={cinemaEvents}
          cityName={cityName}
          variant="newspaper"
        />
      ) : null}

      <section
        className="desktop-portal-bottom desktop-portal-bottom--newsletter"
        aria-label="Haber bülteni"
      >
        <aside className="desktop-portal-nl" aria-label="Haber bülteni">
          <div className="desktop-portal-nl__icon" aria-hidden>
            <Mail className="h-5 w-5" />
          </div>
          <h2 className="desktop-portal-nl__title">Haber bülteni</h2>
          <p>Günün önemli haberleri e-postanıza gelsin.</p>
          <NewsletterSignup
            source="desktop-home"
            variant="compact"
            title=""
            description=""
            className="desktop-portal-nl__form"
          />
        </aside>
      </section>
    </div>
  )
}
