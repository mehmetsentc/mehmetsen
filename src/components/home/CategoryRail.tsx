import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { ROUTES } from '@/constants/routes'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import {
  HOME_CATEGORY_RAIL_DISPLAY,
  HOME_CATEGORY_RAIL_MIN,
} from '@/types/newsItem'
import type { NewsItem } from '@/types/newsItem'

interface CategoryRailProps {
  categoryId: string
  title?: string
  items: NewsItem[]
}

/**
 * Mobil kaydırmalı kategori şeridi.
 * Her kategoride aynı sayıda (DISPLAY) en son haber; MIN'in altında şerit gizlenir.
 * Kart genişliği ~78vw — tek kart kalsa bile yan boşlukla “şerit” hissi korunur.
 */
export function CategoryRail({ categoryId, title, items }: CategoryRailProps) {
  const cards = items.slice(0, HOME_CATEGORY_RAIL_DISPLAY)
  if (cards.length < HOME_CATEGORY_RAIL_MIN) return null

  const heading = title ?? getCategoryLabel(categoryId)
  const categoryHref = ROUTES.CATEGORY(categoryId)

  return (
    <section id={`category-rail-${categoryId}`} className="home-section scroll-mt-24" aria-label={heading}>
      <div className="home-rail-title justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="home-rail-accent shrink-0" aria-hidden />
          <h2 className="truncate text-lg font-black text-[rgb(var(--color-text))]">{heading}</h2>
        </div>
        <Link
          href={categoryHref}
          className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[rgb(var(--color-brand))]"
        >
          Tümünü gör
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div
        className="-mx-1 flex gap-3 overflow-x-auto scroll-px-3 px-1 pb-1 scrollbar-hide"
        data-no-category-swipe
      >
        {cards.map((item) => {
          const image = item.imageUrl || FEED_FALLBACK_LOGO
          return (
            <Link
              key={item.id}
              href={newsItemDetailHref(item)}
              className="w-[78vw] max-w-[280px] shrink-0 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] sm:w-[250px]"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-[rgb(var(--color-border))]">
                <SafeNewsImage
                  src={image}
                  alt={item.title}
                  fill
                  sizes="(max-width: 640px) 78vw, 250px"
                  className="object-cover"
                />
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
