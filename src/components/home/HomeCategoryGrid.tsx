import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { HOME_CATEGORY_RAIL_DISPLAY, HOME_CATEGORY_RAIL_MIN } from '@/types/newsItem'
import type { HomeCategorySlug, NewsItem } from '@/types/newsItem'

type HomeCategoryGridProps = {
  categoryId: HomeCategorySlug
  items: NewsItem[]
}

export function HomeCategoryGrid({ categoryId, items }: HomeCategoryGridProps) {
  const cards = items.slice(0, HOME_CATEGORY_RAIL_DISPLAY)
  if (cards.length < HOME_CATEGORY_RAIL_MIN) return null

  const heading = getCategoryLabel(categoryId)
  const slug = DEFAULT_CATEGORIES.find((c) => c.id === categoryId)?.slug ?? categoryId

  return (
    <section
      className="home-section"
      aria-label={heading}
      data-testid={`home-category-grid-${categoryId}`}
    >
      <div className="home-rail-title justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="home-rail-accent shrink-0" aria-hidden />
          <h2 className="truncate text-lg font-black text-[rgb(var(--color-text))]">{heading}</h2>
        </div>
        <Link
          href={ROUTES.CATEGORY(slug)}
          className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[rgb(var(--color-brand))]"
        >
          Tümünü gör
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <div className="mag-category-grid">
        {cards.map((item) => (
          <Link
            key={item.id}
            href={newsItemDetailHref(item)}
            className="mag-category-grid__card"
          >
            <span className="mag-category-grid__media">
              <SafeNewsImage
                src={item.imageUrl || FEED_FALLBACK_LOGO}
                alt={item.title}
                fill
                sizes="(max-width: 768px) 50vw, 280px"
                className="object-cover"
              />
            </span>
            <span className="mag-category-grid__title">{item.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
