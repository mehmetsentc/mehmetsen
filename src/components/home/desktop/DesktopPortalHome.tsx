'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Mail, Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup'
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

function withImage(items: NewsItem[]): NewsItem[] {
  return items.filter((item) => Boolean(item.imageUrl?.trim()))
}

export function DesktopPortalHome({
  heroSlides,
  mansetItems,
  columnists,
  mostRead,
  categoryCards,
  videoItem,
  photoItems,
}: {
  heroSlides: NewsItem[]
  mansetItems: NewsItem[]
  columnists: NewsItem[]
  mostRead: NewsItem[]
  categoryCards: { id: string; title: string; item: NewsItem | null }[]
  videoItem: NewsItem | null
  photoItems: NewsItem[]
}) {
  const slides = withImage(heroSlides).slice(0, 5)
  const [active, setActive] = useState(0)
  const hero = slides[active] ?? slides[0]
  const isColumnists = columnists.length > 0
  const railItems = withImage(isColumnists ? columnists : mostRead).slice(0, 5)
  const railTitle = isColumnists ? 'Yazarlar' : 'En çok okunan'
  const manset = withImage(mansetItems).slice(0, 5)
  const photos = withImage(photoItems).slice(0, 4)
  const video = videoItem?.imageUrl?.trim() ? videoItem : null
  const cats = categoryCards.filter((card) => card.item?.imageUrl?.trim())

  const go = useCallback(
    (dir: -1 | 1) => {
      if (slides.length <= 1) return
      setActive((current) => (current + dir + slides.length) % slides.length)
    },
    [slides.length]
  )

  return (
    <div className="desktop-portal-home" data-testid="desktop-portal-home">
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
          {cats.map((card) => {
            const accent = PORTAL_CATEGORY_ACCENTS[card.id] ?? getCategoryAccentColor(card.id)
            const item = card.item!
            return (
              <article key={card.id} className="desktop-portal-cat" style={{ borderTopColor: accent }}>
                <Link
                  href={ROUTES.CATEGORY(card.id)}
                  className="desktop-portal-cat__kicker"
                  style={{ color: accent }}
                >
                  {card.title}
                </Link>
                <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__media">
                  <SafeNewsImage
                    src={item.imageUrl}
                    alt=""
                    fill
                    sizes="240px"
                    className="object-cover"
                  />
                </Link>
                <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__title">
                  {item.title}
                </Link>
                {item.summary || item.description ? (
                  <p className="desktop-portal-cat__dek">{item.summary || item.description}</p>
                ) : null}
              </article>
            )
          })}
        </section>
      ) : null}

      <section
        className={cn('desktop-portal-bottom', !video && 'desktop-portal-bottom--no-video')}
        aria-label="Video, fotoğraf ve bülten"
      >
        {video ? (
          <article className="desktop-portal-video">
            <div className="desktop-portal-bottom__head">
              <h2 className="desktop-portal-kicker">Video haberler</h2>
              <Link href={ROUTES.VIDEO} className="desktop-portal-more">
                Tüm videolar
              </Link>
            </div>
            <Link href={newsItemDetailHref(video)} className="desktop-portal-video__card">
              <span className="desktop-portal-video__media">
                <SafeNewsImage
                  src={video.imageUrl}
                  alt=""
                  fill
                  sizes="360px"
                  className="object-cover"
                />
                <span className="desktop-portal-video__play" aria-hidden>
                  <Play className="h-5 w-5 fill-current" />
                </span>
              </span>
              <span className="desktop-portal-video__title">{video.title}</span>
            </Link>
          </article>
        ) : null}

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
