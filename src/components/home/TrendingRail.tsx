import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface TrendingRailProps {
  items: NewsItem[]
}

export function TrendingRail({ items }: TrendingRailProps) {
  if (items.length === 0) return null

  return (
    <section className="home-section" aria-label="Şu an trend">
      <div className="home-rail-title">
        <span className="home-rail-accent" aria-hidden />
        <h2 className="text-lg font-black text-[rgb(var(--color-text))]">Şu An Trend</h2>
        <span className="ml-2 rounded-full bg-[rgb(var(--color-brand))]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
          Canlı
        </span>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide" data-no-category-swipe>
        {items.map((item, index) => {
          const image = item.imageUrl || FEED_FALLBACK_LOGO
          const rank = index + 1
          return (
            <Link
              key={item.id}
              href={newsItemDetailHref(item)}
              className="relative w-[260px] shrink-0 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-[rgb(var(--color-border))]">
                <SafeNewsImage src={image} alt={item.title} fill sizes="260px" className="object-cover" />
                <span
                  className="absolute left-2 top-2 inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-[rgb(var(--color-brand))] px-2 text-xs font-black text-white shadow-md"
                  aria-label={`Trend sırası ${rank}`}
                >
                  #{rank}
                </span>
              </div>
              <div className="p-3">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
                  {newsItemCategoryLabel(item)}
                </span>
                <p className="mt-1 line-clamp-3 text-sm font-bold leading-snug text-[rgb(var(--color-text))]">
                  {item.title}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
