'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { formatNewsRelative } from '@/components/home/desktop/formatNewsDate'
import { HOME_FEATURED_LIMIT, type NewsItem } from '@/types/newsItem'

/**
 * Desktop “Öne Çıkan” — CMS’de işaretli ilk 10 haber (kategori bağımsız).
 * Lead + yan + alt satırlar; yüz/üst kırpma azaltılır (object-top).
 */
export function DesktopFeaturedGrid({ items }: { items: NewsItem[] }) {
  const slides = items.slice(0, HOME_FEATURED_LIMIT)
  if (slides.length === 0) return null

  const [lead, ...rest] = slides
  const side = rest.slice(0, 3)
  const mid = rest.slice(3, 7)
  const bottom = rest.slice(7, 10)

  return (
    <section aria-label="Öne Çıkan Haberler" className="space-y-4">
      <div className="grid grid-cols-12 items-stretch gap-4">
        <article className="col-span-12 min-w-0 lg:col-span-7">
          <Link href={newsItemDetailHref(lead!)} className="group block h-full">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[rgb(var(--color-border))]">
              <SafeNewsImage
                src={lead!.imageUrl || FEED_FALLBACK_LOGO}
                alt={lead!.title}
                fill
                sizes="(max-width: 1280px) 70vw, 720px"
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
          <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-5 lg:grid-cols-1">
            {side.map((item) => (
              <FeaturedSideCard key={item.id} item={item} />
            ))}
          </div>
        ) : null}
      </div>

      {mid.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {mid.map((item) => (
            <FeaturedBottomCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}

      {bottom.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {bottom.map((item) => (
            <FeaturedBottomCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function FeaturedSideCard({ item }: { item: NewsItem }) {
  const time = formatNewsRelative(item.publishedAt ?? item.createdAt)
  return (
    <Link
      href={newsItemDetailHref(item)}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-[rgb(var(--color-border))] lg:aspect-[21/9]">
        <SafeNewsImage
          src={item.imageUrl || FEED_FALLBACK_LOGO}
          alt={item.title}
          fill
          sizes="(max-width: 1024px) 45vw, 280px"
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

function FeaturedBottomCard({ item }: { item: NewsItem }) {
  const time = formatNewsRelative(item.publishedAt ?? item.createdAt)
  return (
    <Link
      href={newsItemDetailHref(item)}
      className="group flex gap-3 overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-2.5"
    >
      <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-border))]">
        <SafeNewsImage
          src={item.imageUrl || FEED_FALLBACK_LOGO}
          alt={item.title}
          fill
          sizes="128px"
          className="object-cover object-top"
        />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <span className="text-[10px] font-black uppercase tracking-wide text-[rgb(var(--color-brand))]">
          {newsItemCategoryLabel(item)}
        </span>
        <h3 className="mt-0.5 line-clamp-3 text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">
          {item.title}
        </h3>
        {time ? (
          <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">{time}</p>
        ) : null}
      </div>
    </Link>
  )
}
