import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { CityNewspaperEventsRail } from '@/components/city/CityNewspaperEventsRail'
import { CityNewspaperFooter } from '@/components/city/CityNewspaperFooter'
import { CityNewspaperServiceCards } from '@/components/city/CityNewspaperServiceCards'
import { getCategoryAccentColor } from '@/lib/categoryAccent'
import { buildCityPortalHomeProps, packNewspaperCategoryLayout } from '@/lib/cityPortalHome'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NaEvent } from '@/types/event'
import type { HomeFeedInitialData, NewsItem } from '@/types/newsItem'

const PORTAL_CATEGORY_ACCENTS: Record<string, string> = {
  siyaset: '#2563EB',
  ekonomi: '#7C3AED',
  dunya: '#059669',
  asayis: '#DC2626',
  spor: '#16A34A',
  teknoloji: '#EA580C',
}

type NewsWithImage = NewsItem & { imageUrl: string }

function hasImage(item: NewsItem): item is NewsWithImage {
  return Boolean(item.imageUrl?.trim())
}

function PortalBandHead({ title, href, more }: { title: string; href: string; more: string }) {
  return (
    <div className="desktop-portal-bottom__head">
      <h2 className="desktop-portal-kicker">{title}</h2>
      <Link href={href} prefetch={false} className="desktop-portal-more">
        {more}
      </Link>
    </div>
  )
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
  if (items.length === 0) return null
  return (
    <section className="desktop-portal-band" aria-label={title}>
      <PortalBandHead title={title} href={href} more="Tümü" />
      <div className="desktop-portal-rail-x">
        {items.map((item) => (
          <article key={item.id} className="desktop-portal-tile">
            {hasImage(item) ? (
              <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__media">
                <SafeNewsImage src={item.imageUrl} alt="" fill sizes="200px" className="object-cover" />
              </Link>
            ) : null}
            <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__title">
              {item.title}
            </Link>
          </article>
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
  const lead = items.find(hasImage) ?? items[0] ?? null
  const rest = items.filter((item) => item.id !== lead?.id).slice(0, 9)
  if (!lead && rest.length === 0) return null

  return (
    <article className="desktop-portal-cat" style={{ borderTopColor: accent }}>
      <Link href={href} prefetch={false} className="desktop-portal-cat__kicker" style={{ color: accent }}>
        {title}
      </Link>
      {lead ? (
        <>
          {hasImage(lead) ? (
            <Link href={newsItemDetailHref(lead)} className="desktop-portal-cat__media">
              <SafeNewsImage src={lead.imageUrl} alt="" fill sizes="360px" className="object-cover" />
            </Link>
          ) : null}
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

function CategoryColumnGrid({
  cards,
  cols,
}: {
  cards: ReturnType<typeof buildCityPortalHomeProps>['categoryCards']
  cols?: number
}) {
  return (
    <section
      className="desktop-portal-cats"
      data-cols={cols && cols !== 4 ? cols : undefined}
      aria-label="Kategoriler"
    >
      {cards.map((card) => (
        <PortalLeadColumn
          key={card.id}
          title={card.title}
          href={card.href}
          accent={PORTAL_CATEGORY_ACCENTS[card.id] ?? getCategoryAccentColor(card.id)}
          items={card.items}
        />
      ))}
    </section>
  )
}

export function CityDesktopNewspaperRsc({
  cityName,
  citySlug,
  data,
  events = [],
}: {
  cityName: string
  citySlug: string
  data: HomeFeedInitialData
  events?: NaEvent[]
}) {
  const portal = buildCityPortalHomeProps(data)
  const hero = portal.heroSlides[0] ?? null
  const packed = packNewspaperCategoryLayout(
    portal.categoryCards.filter((card) => card.layout === 'column'),
    portal.categoryCards.filter((card) => card.layout === 'rail')
  )
  const videos = portal.videoItems

  return (
    <div
      className="city-desktop-newspaper-page desktop-portal-home w-full"
      data-testid="desktop-portal-home"
      data-city-portal="1"
    >
      <h1 className="sr-only">{cityName} Haberleri — NaHaber</h1>

      <section className="desktop-portal-stage" aria-label="Manşet">
        <aside className="desktop-portal-manset" aria-label="Günün manşetleri">
          <h2 className="desktop-portal-kicker">Günün manşetleri</h2>
          <ul className="desktop-portal-manset__list">
            {portal.mansetItems.map((item) => (
              <li key={item.id}>
                <Link
                  href={newsItemDetailHref(item)}
                  className="desktop-portal-manset__row desktop-portal-manset__row--thumb"
                >
                  <span className="desktop-portal-manset__thumb">
                    {hasImage(item) ? (
                      <SafeNewsImage
                        src={item.imageUrl}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="desktop-portal-manset__title">{item.title}</span>
                </Link>
              </li>
            ))}
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
              </div>
            </div>
          </article>
        ) : null}

        {portal.mostRead.length > 0 ? (
          <aside className="desktop-portal-rail" aria-label="En çok okunan">
            <div className="desktop-portal-rail__head">
              <h2 className="desktop-portal-kicker">En çok okunan</h2>
            </div>
            <ul className="desktop-portal-rail__list">
              {portal.mostRead.map((item) => (
                <li key={item.id}>
                  <Link
                    href={newsItemDetailHref(item)}
                    className="desktop-portal-manset__row desktop-portal-manset__row--thumb"
                  >
                    <span className="desktop-portal-manset__thumb">
                      {hasImage(item) ? (
                        <SafeNewsImage
                          src={item.imageUrl}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="desktop-portal-manset__title">{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </section>

      <CityNewspaperServiceCards citySlug={citySlug} cityName={cityName} />
      <CityNewspaperEventsRail cityName={cityName} events={events} />

      {packed.gridCards.length > 0 ? (
        <CategoryColumnGrid cards={packed.gridCards} />
      ) : null}

      {packed.leftoverGrid.length > 0 ? (
        <CategoryColumnGrid cards={packed.leftoverGrid} cols={packed.leftoverGrid.length} />
      ) : null}

      {packed.leftoverRails.map((card) => (
        <PortalScrollRail key={card.id} title={card.title} href={card.href} items={card.items} />
      ))}

      {packed.restRails.map((card) => (
        <PortalScrollRail key={card.id} title={card.title} href={card.href} items={card.items} />
      ))}

      {videos.length > 0 ? (
        <PortalScrollRail title="Video" href="/kategori/video" items={videos} />
      ) : null}

      <section
        className="desktop-portal-bottom desktop-portal-bottom--no-video"
        aria-label="Haber bülteni"
      >
        <aside className="desktop-portal-nl" aria-label="Haber bülteni">
          <h2 className="desktop-portal-nl__title">Haber bülteni</h2>
          <p>Günün önemli haberleri e-postanıza gelsin.</p>
          <form action="/bulten" method="get" className="desktop-portal-nl__form">
            <label className="sr-only" htmlFor="city-nl-email">
              E-posta adresiniz
            </label>
            <input
              id="city-nl-email"
              type="email"
              name="email"
              required
              placeholder="E-posta adresiniz"
              className="w-full rounded-full border border-white/30 bg-white px-4 py-2 text-sm text-neutral-900"
            />
            <button type="submit" className="mt-3 rounded-full bg-white px-5 py-2 text-sm font-bold text-[#e50914]">
              Abone Ol
            </button>
          </form>
        </aside>
      </section>

      <CityNewspaperFooter cityName={cityName} />
    </div>
  )
}
