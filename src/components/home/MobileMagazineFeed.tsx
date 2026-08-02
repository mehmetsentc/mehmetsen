'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'
import { cn } from '@/lib/utils'

function MobileListStory({ item }: { item: NewsItem }) {
  const href = newsItemDetailHref(item)
  const image = item.imageUrl || FEED_FALLBACK_LOGO

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
            'max-md:mx-4 max-md:mb-0 max-md:w-[calc(100%-2rem)] max-md:rounded-[14px]'
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

        <h3 className="px-0 text-base font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline max-md:mt-3 max-md:px-4 max-md:text-[1.125rem] max-md:font-extrabold max-md:leading-[1.3]">
          {item.title}
        </h3>
      </Link>
    </article>
  )
}

interface MobileMagazineFeedProps {
  items: NewsItem[]
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
}

/** Mobile home Akış: image + full headline only. */
export function MobileMagazineFeed({
  items,
  loadingMore,
  hasMore,
  onLoadMore,
}: MobileMagazineFeedProps) {
  if (items.length === 0 && !loadingMore) return null

  return (
    <div className="flex flex-col gap-4 max-md:gap-5">
      {items.map((item) => (
        <MobileListStory key={item.id} item={item} />
      ))}

      {loadingMore ? (
        <>
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 border-b border-[rgb(var(--color-border))] pb-4 max-md:gap-2 max-md:border-0 max-md:pb-0"
            >
              <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-[rgb(var(--color-border))] max-md:mx-4 max-md:w-[calc(100%-2rem)] max-md:rounded-[14px]" />
              <div className="max-md:px-4">
                <div className="mt-2 h-5 w-full animate-pulse rounded bg-[rgb(var(--color-border))]" />
                <div className="mt-1.5 h-5 w-4/5 animate-pulse rounded bg-[rgb(var(--color-border))]" />
              </div>
            </div>
          ))}
        </>
      ) : null}

      {hasMore && onLoadMore ? (
        <LoadMoreDayButton onClick={onLoadMore} loading={loadingMore} />
      ) : null}
    </div>
  )
}
