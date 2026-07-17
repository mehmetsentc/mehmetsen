'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

function MobileListStory({ item }: { item: NewsItem }) {
  const href = newsItemDetailHref(item)
  const image = item.imageUrl || FEED_FALLBACK_LOGO
  const category = getCategoryLabel(item.category)

  return (
    <article className="border-b border-[rgb(var(--color-border))] pb-4 last:border-0">
      <Link href={href} className="group block">
        {/* Full-width image */}
        <div className="relative mb-3 aspect-[16/9] w-full overflow-hidden rounded-xl bg-[rgb(var(--color-border))]">
          <SafeNewsImage
            src={image}
            alt={item.title}
            fill
            sizes="100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        {/* Category */}
        {category ? (
          <span className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
            {category}
          </span>
        ) : null}
        {/* Title */}
        <h3 className="mt-1 line-clamp-3 text-base font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">
          {item.title}
        </h3>
      </Link>
    </article>
  )
}

interface MobileMagazineFeedProps {
  items: NewsItem[]
  loadingMore?: boolean
  sentinelRef?: React.RefObject<HTMLDivElement | null>
}

/**
 * Single-column list feed for mobile home (Sözcü style).
 * Full-width image + category label + title per card.
 */
export function MobileMagazineFeed({ items, loadingMore, sentinelRef }: MobileMagazineFeedProps) {
  if (items.length === 0 && !loadingMore) return null

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <MobileListStory key={item.id} item={item} />
      ))}

      {loadingMore ? (
        <>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex flex-col gap-2 pb-4 border-b border-[rgb(var(--color-border))]">
              <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-[rgb(var(--color-border))]" />
              <div className="h-3 w-16 animate-pulse rounded bg-[rgb(var(--color-border))]" />
              <div className="h-5 w-full animate-pulse rounded bg-[rgb(var(--color-border))]" />
              <div className="h-5 w-3/4 animate-pulse rounded bg-[rgb(var(--color-border))]" />
            </div>
          ))}
        </>
      ) : null}

      {sentinelRef ? <div ref={sentinelRef} className="h-1" aria-hidden /> : null}
    </div>
  )
}
