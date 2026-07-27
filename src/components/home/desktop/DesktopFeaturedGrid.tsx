'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { formatNewsRelative } from '@/components/home/desktop/formatNewsDate'
import { HOME_FEATURED_LIMIT, type NewsItem } from '@/types/newsItem'

/**
 * Desktop “Öne Çıkan” — 10 haber, boş hücre yok.
 * Üst: lead (~2 yan kart yüksekliği) + 2 yan; 3. yan + kalanlar altta 3’lü satırlar.
 */
export function DesktopFeaturedGrid({ items }: { items: NewsItem[] }) {
  const slides = items.slice(0, HOME_FEATURED_LIMIT)
  if (slides.length === 0) return null

  const [lead, ...rest] = slides
  // Lead yüksekliği 2 kareye denk gelsin: yanında yalnızca 2 kart
  const side = rest.slice(0, Math.min(2, rest.length))
  const below = rest.slice(side.length)

  return (
    <section aria-label="Öne Çıkan Haberler" className="space-y-3">
      {side.length === 2 ? (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12 lg:grid-rows-2 lg:gap-4">
          <article className="relative aspect-[16/10] min-w-0 lg:col-span-8 lg:row-span-2 lg:aspect-auto lg:h-full lg:min-h-0">
            <LeadCard item={lead!} />
          </article>
          {side.map((item) => (
            <div key={item.id} className="min-h-0 lg:col-span-4">
              <FeaturedSideCard item={item} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12 lg:gap-4">
          <article className="relative aspect-[16/10] min-w-0 lg:col-span-8">
            <LeadCard item={lead!} />
          </article>
          {side.length > 0 ? (
            <div className="flex flex-col gap-3 lg:col-span-4">
              {side.map((item) => (
                <FeaturedSideCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {below.length > 0 ? (
        <div className={belowGridClass(below.length)}>
          {below.map((item) => (
            <FeaturedTileCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function LeadCard({ item }: { item: NewsItem }) {
  return (
    <Link href={newsItemDetailHref(item)} className="group absolute inset-0 block">
      <div className="relative h-full overflow-hidden rounded-xl bg-[rgb(var(--color-border))]">
        <SafeNewsImage
          src={item.imageUrl || FEED_FALLBACK_LOGO}
          alt={item.title}
          fill
          sizes="(max-width: 1280px) 70vw, 780px"
          priority
          className="object-cover object-center transition-transform duration-300 group-hover:scale-[1.01]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <span className="mb-2 inline-flex rounded-md bg-[rgb(var(--color-brand))] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
            {newsItemCategoryLabel(item)}
          </span>
          <h2 className="line-clamp-3 text-xl font-black leading-tight text-white sm:text-2xl lg:text-[1.65rem]">
            {item.title}
          </h2>
          {item.description ? (
            <p className="mt-2 line-clamp-2 hidden text-sm text-white/85 sm:block">
              {item.description}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

/** Satırları tam doldur — 2/3/4/6/7/8 için boş hücre bırakmayı azalt. */
function belowGridClass(count: number): string {
  const base = 'grid gap-4'
  if (count <= 1) return `${base} grid-cols-1`
  if (count === 2) return `${base} grid-cols-1 sm:grid-cols-2`
  if (count === 4) return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
  if (count === 5) return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`
  if (count === 7) return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
  if (count % 3 === 0) return `${base} grid-cols-1 sm:grid-cols-3`
  if (count % 2 === 0) return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-2`
  return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
}

function FeaturedSideCard({ item }: { item: NewsItem }) {
  const time = formatNewsRelative(item.publishedAt ?? item.createdAt)
  return (
    <Link
      href={newsItemDetailHref(item)}
      className="group flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]"
    >
      {/* Sabit oran — flex min-height ile ezilmesin (önceki ince şerit bug’ı) */}
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-[rgb(var(--color-border))]">
        <SafeNewsImage
          src={item.imageUrl || FEED_FALLBACK_LOGO}
          alt={item.title}
          fill
          sizes="(max-width: 1024px) 45vw, 320px"
          className="object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center px-3 py-2.5">
        <span className="mb-0.5 text-[10px] font-black uppercase tracking-wide text-[rgb(var(--color-brand))]">
          {newsItemCategoryLabel(item)}
        </span>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">
          {item.title}
        </h3>
        {time ? (
          <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">{time}</p>
        ) : null}
      </div>
    </Link>
  )
}

/** Alt satır — dikey kart; satırdaki hücreleri eşit doldurur. */
function FeaturedTileCard({ item }: { item: NewsItem }) {
  const time = formatNewsRelative(item.publishedAt ?? item.createdAt)
  return (
    <Link
      href={newsItemDetailHref(item)}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[rgb(var(--color-border))]">
        <SafeNewsImage
          src={item.imageUrl || FEED_FALLBACK_LOGO}
          alt={item.title}
          fill
          sizes="(max-width: 1024px) 50vw, 280px"
          className="object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <div className="flex flex-1 flex-col p-3">
        <span className="mb-1 text-[10px] font-black uppercase tracking-wide text-[rgb(var(--color-brand))]">
          {newsItemCategoryLabel(item)}
        </span>
        <h3 className="line-clamp-3 text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">
          {item.title}
        </h3>
        {time ? (
          <p className="mt-auto pt-2 text-xs text-[rgb(var(--color-muted))]">{time}</p>
        ) : null}
      </div>
    </Link>
  )
}
