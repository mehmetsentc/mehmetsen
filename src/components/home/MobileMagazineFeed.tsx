'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

function MobileGridStory({ item }: { item: NewsItem }) {
  const href = newsItemDetailHref(item)
  const image = item.imageUrl || FEED_FALLBACK_LOGO
  const category = getCategoryLabel(item.category)

  return (
    <article className="min-w-0">
      <Link href={href} className="group block min-w-0">
        <div className="relative mb-2 aspect-[3/2] w-full overflow-hidden rounded-xl bg-[rgb(var(--color-border))]">
          <SafeNewsImage
            src={image}
            alt={item.title}
            fill
            sizes="50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        {category ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
            {category}
          </span>
        ) : null}
        <h3
          className={cn(
            'mt-1 line-clamp-3 break-words text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline'
          )}
        >
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
 * 2-column magazine-style feed cards for mobile home.
 * Renders a plain wrapper — the caller owns section spacing (`home-section`)
 * so we avoid nested padding/margin.
 */
export function MobileMagazineFeed({ items, loadingMore, sentinelRef }: MobileMagazineFeedProps) {
  if (items.length === 0 && !loadingMore) return null

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <MobileGridStory key={item.id} item={item} />
        ))}
      </div>
      {loadingMore ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-[3/2] animate-pulse rounded-xl bg-[rgb(var(--color-border))]" />
          ))}
        </div>
      ) : null}
      {sentinelRef ? <div ref={sentinelRef} className="h-1" aria-hidden /> : null}
    </div>
  )
}
