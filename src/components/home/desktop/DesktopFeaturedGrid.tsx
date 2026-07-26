'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { formatNewsRelative } from '@/components/home/desktop/formatNewsDate'
import { HOME_FEATURED_LIMIT, type NewsItem } from '@/types/newsItem'

/**
 * Desktop “Öne Çıkan” — 10 haber, boş hücre yok.
 * Üst: lead + 3 yan. Alt: kalanlar 3’lü tam satırlar (10 → 6 = 2×3).
 */
export function DesktopFeaturedGrid({ items }: { items: NewsItem[] }) {
  const slides = items.slice(0, HOME_FEATURED_LIMIT)
  if (slides.length === 0) return null

  const [lead, ...rest] = slides
  // 10 haber: 1 lead + 3 yan + 6 alt (2 tam satır) — yarım satır kalmaz
  const sideCount = Math.min(3, rest.length)
  const side = rest.slice(0, sideCount)
  const below = rest.slice(sideCount)

  return (
    <section aria-label="Öne Çıkan Haberler" className="space-y-4">
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12">
        <article className="min-w-0 lg:col-span-8">
          <Link href={newsItemDetailHref(lead!)} className="group block h-full">
            <div className="relative aspect-[16/10] h-full min-h-[280px] overflow-hidden rounded-xl bg-[rgb(var(--color-border))] lg:min-h-0 lg:aspect-auto">
              <SafeNewsImage
                src={lead!.imageUrl || FEED_FALLBACK_LOGO}
                alt={lead!.title}
                fill
                sizes="(max-width: 1280px) 70vw, 780px"
                priority
                className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.01]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                <span className="mb-2 inline-flex rounded-md bg-[rgb(var(--color-brand))] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
                  {newsItemCategoryLabel(lead!)}
                </span>
                <h2 className="line-clamp-3 text-xl font-black leading-tight text-white sm:text-2xl lg:text-[1.65rem]">
                  {lead!.title}
                </h2>
                {lead!.description ? (
                  <p className="mt-2 line-clamp-2 hidden text-sm text-white/85 sm:block">
                    {lead!.description}
                  </p>
                ) : null}
              </div>
            </div>
          </Link>
        </article>

        {side.length > 0 ? (
          <div
            className={
              side.length === 1
                ? 'grid grid-cols-1 gap-4 lg:col-span-4'
                : side.length === 2
                  ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1'
                  : 'grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-4 lg:grid-cols-1'
            }
          >
            {side.map((item) => (
              <FeaturedSideCard key={item.id} item={item} />
            ))}
          </div>
        ) : null}
      </div>

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

/** Satırları tam doldur — 2/3/4/6 için boş hücre bırakma. */
function belowGridClass(count: number): string {
  const base = 'grid gap-4'
  if (count <= 1) return `${base} grid-cols-1`
  if (count === 2) return `${base} grid-cols-1 sm:grid-cols-2`
  if (count === 4) return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
  if (count === 5) return `${base} grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`
  // 3, 6, 9 → üçlü tam satırlar (10 featured’ın altı: 6)
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
      <div className="relative aspect-[16/9] min-h-[88px] flex-1 overflow-hidden bg-[rgb(var(--color-border))] lg:aspect-auto lg:min-h-[96px]">
        <SafeNewsImage
          src={item.imageUrl || FEED_FALLBACK_LOGO}
          alt={item.title}
          fill
          sizes="(max-width: 1024px) 45vw, 320px"
          className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <div className="flex shrink-0 flex-col p-3">
        <span className="mb-1 text-[10px] font-black uppercase tracking-wide text-[rgb(var(--color-brand))]">
          {newsItemCategoryLabel(item)}
        </span>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">
          {item.title}
        </h3>
        {time ? (
          <p className="mt-1.5 text-xs text-[rgb(var(--color-muted))]">{time}</p>
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
          className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
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
