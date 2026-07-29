'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'
import { cn } from '@/lib/utils'

function MobileListStory({
  item,
  emphasize,
}: {
  item: NewsItem
  /** Every 5th card gets a slightly taller image for editorial rhythm */
  emphasize?: boolean
}) {
  const href = newsItemDetailHref(item)
  const image = item.imageUrl || FEED_FALLBACK_LOGO
  const category = getCategoryLabel(item.category)
  const summary = (item.description || '').trim()

  return (
    <article
      className={cn(
        'border-b border-[rgb(var(--color-border))] pb-4 last:border-0',
        'max-md:border-0 max-md:pb-0'
      )}
    >
      <Link href={href} className="group block">
        <div
          className={cn(
            'relative mb-3 aspect-[16/9] w-full overflow-hidden rounded-xl bg-[rgb(var(--color-border))]',
            'max-md:mx-4 max-md:mb-0 max-md:w-[calc(100%-2rem)] max-md:rounded-[16px]',
            emphasize && 'max-md:aspect-[4/3]'
          )}
        >
          <SafeNewsImage
            src={image}
            alt={item.title}
            fill
            sizes="(max-width: 767px) 100vw, 700px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>

        <div className="max-md:mt-4 max-md:px-4">
          {category ? (
            <span className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))] max-md:text-[13px]">
              {category}
            </span>
          ) : null}
          <h3 className="mt-1 line-clamp-3 text-base font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline max-md:mt-2 max-md:text-[clamp(1.45rem,_6vw,_1.75rem)] max-md:font-extrabold max-md:leading-[1.2]">
            {item.title}
          </h3>
          {summary ? (
            <p className="mt-2 hidden line-clamp-2 text-[15px] leading-relaxed text-[rgb(var(--color-muted))] max-md:block">
              {summary}
            </p>
          ) : null}
        </div>
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
 * Single-column editorial list for mobile home.
 * Large image + category + headline; whitespace separates stories on mobile.
 */
export function MobileMagazineFeed({ items, loadingMore, sentinelRef }: MobileMagazineFeedProps) {
  if (items.length === 0 && !loadingMore) return null

  return (
    <div className="flex flex-col gap-4 max-md:gap-9">
      {items.map((item, index) => (
        <MobileListStory key={item.id} item={item} emphasize={index > 0 && index % 5 === 0} />
      ))}

      {loadingMore ? (
        <>
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 border-b border-[rgb(var(--color-border))] pb-4 max-md:gap-3 max-md:border-0 max-md:pb-0"
            >
              <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-[rgb(var(--color-border))] max-md:mx-4 max-md:w-[calc(100%-2rem)] max-md:rounded-[16px]" />
              <div className="max-md:px-4">
                <div className="h-3 w-16 animate-pulse rounded bg-[rgb(var(--color-border))]" />
                <div className="mt-2 h-6 w-full animate-pulse rounded bg-[rgb(var(--color-border))] max-md:h-7" />
                <div className="mt-1.5 h-5 w-3/4 animate-pulse rounded bg-[rgb(var(--color-border))] max-md:h-7" />
              </div>
            </div>
          ))}
        </>
      ) : null}

      {sentinelRef ? <div ref={sentinelRef} className="h-1" aria-hidden /> : null}
    </div>
  )
}
