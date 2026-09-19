import Link from 'next/link'
import { formatNewsClockTime } from '@/components/home/desktop/formatNewsDate'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { CityNewspaperFooter } from '@/components/city/CityNewspaperFooter'
import { getCategoryAccentColor } from '@/lib/categoryAccent'
import { buildCityPortalHomeProps } from '@/lib/cityPortalHome'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
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
  const lead = items.find(hasImage)
  const rest = items.filter((item) => item.id !== lead?.id).slice(0, 9)
  if (!lead && rest.length === 0) return null

  return (
    <article className="desktop-portal-cat" style={{ borderTopColor: accent }}>
      <Link href={href} prefetch={false} className="desktop-portal-cat__kicker" style={{ color: accent }}>
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

export function CityDesktopNewspaperRsc({
  cityName,
  citySlug: _citySlug,
  data,
}: {
  cityName: string
  citySlug: string
  data: HomeFeedInitialData
}) {
  const portal = buildCityPortalHomeProps(data)
  const hero = portal.heroSlides[0] ?? null
  const gundem = portal.gundemItems.filter(hasImage).slice(0, 10)
  const yerel = portal.yerelItems
  const thirdPage = portal.thirdPageItems
  const kultur = portal.kulturItems
  const saglik = portal.saglikItems
  const turizm = portal.turizmItems
  const yasam = portal.yasamItems
  const magazin = portal.magazinItems.filter(hasImage)
  const videos = portal.videoItems.filter(hasImage)

  return (
    <div className="content-stage content-stage-newspaper city-desktop-portal" data-city-portal="1">
    <div
      className="content-main content-main-newspaper desktop-newspaper city-desktop-newspaper-page desktop-portal-home w-full"
      data-testid="desktop-portal-home"
    >
      <h1 className="sr-only">{cityName} Haberleri — NaHaber</h1>

      <section className="desktop-portal-stage" aria-label="Manşet">
        <aside className="desktop-portal-manset" aria-label="Günün manşetleri">
          <h2 className="desktop-portal-kicker">Günün manşetleri</h2>
          <ul className="desktop-portal-manset__list">
            {portal.mansetItems.map((item) => {
              const clock = formatNewsClockTime(item.publishedAt ?? item.createdAt)
              return (
                <li key={item.id}>
                  <Link href={newsItemDetailHref(item)} className="desktop-portal-manset__row">
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

      {portal.categoryCards.length > 0 ? (
        <section className="desktop-portal-cats" aria-label="Kategoriler">
          {portal.categoryCards.map((card) => (
            <PortalLeadColumn
              key={card.id}
              title={card.title}
              href={`/kategori/${card.id === 'dunya' ? 'dunya' : card.id}`}
              accent={PORTAL_CATEGORY_ACCENTS[card.id] ?? getCategoryAccentColor(card.id)}
              items={card.items}
            />
          ))}
        </section>
      ) : null}

      {gundem.length > 0 ? (
        <section className="desktop-portal-band" aria-label="Gündem">
          <PortalBandHead title="Gündem" href="/kategori/gundem" more="Tümü" />
          <div className="desktop-portal-rail-x">
            {gundem.map((item) => (
              <article key={item.id} className="desktop-portal-tile">
                <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__media">
                  <SafeNewsImage src={item.imageUrl} alt="" fill sizes="200px" className="object-cover" />
                </Link>
                <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__title">
                  {item.title}
                </Link>
              </article>
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
                href="/kategori/yerel-haber"
                accent={getCategoryAccentColor('yerel-haber')}
                items={yerel}
              />
            ) : null}
            {thirdPage.length > 0 ? (
              <PortalLeadColumn
                title="3. Sayfa"
                href="/kategori/asayis"
                accent={getCategoryAccentColor('asayis')}
                items={thirdPage}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="desktop-portal-band" aria-label="Video">
          <PortalBandHead title="Video" href="/kategori/video" more="Tüm videolar" />
          <div className="desktop-portal-rail-x">
            {videos.map((item) => (
              <article key={item.id} className="desktop-portal-video-tile">
                <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__media">
                  <SafeNewsImage src={item.imageUrl} alt="" fill sizes="240px" className="object-cover" />
                  <span className="desktop-portal-video__play" aria-hidden>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7-11-7Z" />
                    </svg>
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
                href="/kategori/kultur"
                accent={getCategoryAccentColor('kultur')}
                items={kultur}
              />
            ) : null}
            {saglik.length > 0 ? (
              <PortalLeadColumn
                title="Sağlık"
                href="/kategori/saglik"
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
                href="/kategori/turizm"
                accent={getCategoryAccentColor('turizm')}
                items={turizm}
              />
            ) : null}
            {yasam.length > 0 ? (
              <PortalLeadColumn
                title="Yaşam"
                href="/kategori/yasam"
                accent={getCategoryAccentColor('yasam')}
                items={yasam}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {magazin.length > 0 ? (
        <section className="desktop-portal-band" aria-label="Magazin">
          <PortalBandHead title="Magazin" href="/kategori/magazin" more="Tümü" />
          <div className="desktop-portal-rail-x">
            {magazin.map((item) => (
              <article key={item.id} className="desktop-portal-tile">
                <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__media">
                  <SafeNewsImage src={item.imageUrl} alt="" fill sizes="200px" className="object-cover" />
                </Link>
                <Link href={newsItemDetailHref(item)} className="desktop-portal-cat__title">
                  {item.title}
                </Link>
              </article>
            ))}
          </div>
        </section>
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
    </div>
  )
}
