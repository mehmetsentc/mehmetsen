'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Mail, Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup'
import { DesktopPortalPulse } from '@/components/home/desktop/DesktopPortalPulse'
import { formatNewsClockTime } from '@/components/home/desktop/formatNewsDate'
import { getCategoryAccentColor } from '@/lib/categoryAccent'
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
  photoItems,
  gundemItems = [],
  yerelItems = [],
  thirdPageItems = [],
  videoItems = [],
  kulturItems = [],
  saglikItems = [],
  turizmItems = [],
  yasamItems = [],
  magazinItems = [],
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
}) {
  const slides = withImage(heroSlides).slice(0, 5)
  const [active, setActive] = useState(0)
  const hero = slides[active] ?? slides[0]
  const isColumnists = columnists.length > 0
  const railItems = withImage(isColumnists ? columnists : mostRead).slice(0, 5)
  const railTitle = isColumnists ? 'Yazarlar' : 'En çok okunan'
  const manset = withImage(mansetItems).slice(0, 5)
  const photos = withImage(photoItems).slice(0, 4)
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
  const cats = categoryCards.filter((card) => card.items.length > 0)

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

      {cats.length > 0 ? (
        <section className="desktop-portal-cats" aria-label="Kategoriler">
          {cats.map((card) => (
            <PortalLeadColumn
              key={card.id}
              title={card.title}
              href={ROUTES.CATEGORY(card.id)}
              accent={PORTAL_CATEGORY_ACCENTS[card.id] ?? getCategoryAccentColor(card.id)}
              items={card.items}
            />
          ))}
        </section>
      ) : null}

      <DesktopPortalPulse />

      {gundem.length > 0 ? (
        <section className="desktop-portal-band" aria-label="Gündem">
          <PortalBandHead title="Gündem" href={ROUTES.CATEGORY('gundem')} more="Tümü" />
          <div className="desktop-portal-rail-x">
            {gundem.map((item) => (
              <PortalTile key={item.id} item={item} sizes="200px" />
            ))}
          </div>
        </section>
      ) : null}

      {yerel.length > 0 || thirdPage.length > 0 ? (
        <section className="desktop-portal-band" aria-label="Yerel ve 3. Sayfa">
          <div className="desktop-portal-split">
            {yerel.length > 0 ? (
              <PortalLeadColumn
                title="Yerel"
                href={ROUTES.CATEGORY('yerel-haber')}
                accent={getCategoryAccentColor('yerel-haber')}
                items={yerel}
              />
            ) : null}
            {thirdPage.length > 0 ? (
              <PortalLeadColumn
                title="3. Sayfa"
                href={ROUTES.CATEGORY('asayis')}
                accent={getCategoryAccentColor('asayis')}
                items={thirdPage}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="desktop-portal-band" aria-label="Video">
          <PortalBandHead title="Video" href={ROUTES.VIDEO} more="Tüm videolar" />
          <div className="desktop-portal-rail-x">
            {videos.map((item) => (
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

      {kultur.length > 0 || saglik.length > 0 ? (
        <section className="desktop-portal-band" aria-label="Kültür ve sağlık">
          <div className="desktop-portal-split">
            {kultur.length > 0 ? (
              <PortalLeadColumn
                title="Kültür"
                href={ROUTES.CATEGORY('kultur')}
                accent={getCategoryAccentColor('kultur')}
                items={kultur}
              />
            ) : null}
            {saglik.length > 0 ? (
              <PortalLeadColumn
                title="Sağlık"
                href={ROUTES.CATEGORY('saglik')}
                accent={getCategoryAccentColor('saglik')}
                items={saglik}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {turizm.length > 0 || yasam.length > 0 ? (
        <section className="desktop-portal-band" aria-label="Turizm ve yaşam">
          <div className="desktop-portal-split">
            {turizm.length > 0 ? (
              <PortalLeadColumn
                title="Turizm"
                href={ROUTES.CATEGORY('turizm')}
                accent={getCategoryAccentColor('turizm')}
                items={turizm}
              />
            ) : null}
            {yasam.length > 0 ? (
              <PortalLeadColumn
                title="Yaşam"
                href={ROUTES.CATEGORY('yasam')}
                accent={getCategoryAccentColor('yasam')}
                items={yasam}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {withImage(magazin).length > 0 ? (
        <section className="desktop-portal-band" aria-label="Magazin">
          <PortalBandHead title="Magazin" href={ROUTES.CATEGORY('magazin')} more="Tümü" />
          <div className="desktop-portal-rail-x">
            {withImage(magazin).map((item) => (
              <PortalTile key={item.id} item={item} sizes="200px" />
            ))}
          </div>
        </section>
      ) : null}

      <section
        className="desktop-portal-bottom desktop-portal-bottom--no-video"
        aria-label="Fotoğraf ve bülten"
      >
        {photos.length > 0 ? (
          <article className="desktop-portal-photos">
            <div className="desktop-portal-bottom__head">
              <h2 className="desktop-portal-kicker">Foto galeri</h2>
              <Link href={ROUTES.CATEGORY('kultur')} className="desktop-portal-more">
                Tüm galeriler
              </Link>
            </div>
            <ul className="desktop-portal-photos__grid">
              {photos.map((item) => (
                <li key={item.id}>
                  <Link href={newsItemDetailHref(item)} className="desktop-portal-photos__card">
                    <SafeNewsImage
                      src={item.imageUrl}
                      alt=""
                      fill
                      sizes="160px"
                      className="object-cover"
                    />
                    <span>{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

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
