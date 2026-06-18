import Link from 'next/link'
import Image from 'next/image'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import type { NewsItem } from '@/types/newsItem'

interface CategoryRailProps {
  categoryId: string
  title?: string
  items: NewsItem[]
}

export function CategoryRail({ categoryId, title, items }: CategoryRailProps) {
  if (items.length === 0) return null

  const heading = title ?? getCategoryLabel(categoryId)

  return (
    <section className="home-section" aria-label={heading}>
      <div className="home-rail-title">
        <span className="home-rail-accent" aria-hidden />
        <h2 className="text-lg font-black text-[rgb(var(--color-text))]">{heading}</h2>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {items.map((item) => {
          const image = item.imageUrl || FEED_FALLBACK_LOGO
          return (
            <Link
              key={item.id}
              href={newsItemDetailHref(item)}
              className="w-[250px] shrink-0 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-neutral-100">
                <Image src={image} alt={item.title} fill sizes="250px" className="object-cover" />
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
