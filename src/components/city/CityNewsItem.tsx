'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

interface CityNewsItemProps {
  item: NewsItem
  priority?: boolean
}

export function CityNewsItem({ item, priority = false }: CityNewsItemProps) {
  const timeAgo = item.publishedAt
    ? formatDistanceToNow(new Date(item.publishedAt), {
        addSuffix: true,
        locale: tr,
      })
    : ''

  const href = `/haber/${item.slug}`

  return (
    <Link href={href} className="group block" prefetch={false}>
      <article className="flex gap-3 py-3">
        {item.imageUrl && (
          <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-surface-raised))]">
            <SafeNewsImage
              src={item.imageUrl}
              alt={item.title}
              fill
              sizes="112px"
              className="object-cover transition-transform group-hover:scale-105"
              priority={priority}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <h3
            className={cn(
              'line-clamp-2 text-[15px] font-semibold leading-snug text-[rgb(var(--color-text))]',
              'group-hover:text-[rgb(var(--color-brand))] transition-colors'
            )}
          >
            {item.seoTitle || item.title}
          </h3>

          <div className="flex items-center gap-2 text-xs text-[rgb(var(--color-text-secondary))]">
            {item.category && (
              <span className="font-medium capitalize">
                {item.category.replace(/-/g, ' ')}
              </span>
            )}
            {item.category && timeAgo && <span>·</span>}
            {timeAgo && <time>{timeAgo}</time>}
          </div>
        </div>
      </article>
    </Link>
  )
}
