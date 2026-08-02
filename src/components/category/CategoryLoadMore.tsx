'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'
import type { CategoryFeedPage } from '@/services/newsService.server'

interface CategoryLoadMoreProps {
  categoryId: string
  initialItems: NewsItem[]
  initialCursor: string | null
  initialHasMore: boolean
}

function NewsRow({ item }: { item: NewsItem }) {
  const href = newsItemDetailHref(item)
  const timeAgo = item.publishedAt
    ? formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: tr })
    : ''

  return (
    <Link
      href={href}
      className="flex gap-3 border-b border-[rgb(var(--color-border))] py-3 hover:bg-[rgb(var(--color-surface))] transition-colors px-1"
    >
      {item.imageUrl && (
        <div className="relative h-20 w-28 flex-shrink-0 overflow-hidden rounded-lg">
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            className="object-cover"
            sizes="112px"
          />
        </div>
      )}
      <div className="flex flex-col justify-between min-w-0 py-0.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--color-text))]">
          {item.title}
        </h3>
        {item.description && (
          <p className="mt-1 line-clamp-1 text-xs text-[rgb(var(--color-text-muted))]">
            {item.description}
          </p>
        )}
        <span className="mt-1 text-[11px] text-[rgb(var(--color-text-muted))]">{timeAgo}</span>
      </div>
    </Link>
  )
}

export function CategoryLoadMore({
  categoryId,
  initialItems,
  initialCursor,
  initialHasMore,
}: CategoryLoadMoreProps) {
  const [items, setItems] = useState<NewsItem[]>(initialItems)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [isPending, startTransition] = useTransition()

  const loadMore = () => {
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ id: categoryId, limit: '20' })
        if (cursor) params.set('cursor', cursor)
        const res = await fetch(`/api/feed/category?${params}`)
        if (!res.ok) return
        const data: CategoryFeedPage = await res.json()
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id))
          return [...prev, ...data.items.filter((i) => !seen.has(i.id))]
        })
        setCursor(data.nextCursor)
        setHasMore(data.hasMore)
      } catch {
        // silently fail
      }
    })
  }

  return (
    <div>
      <div className="divide-y divide-[rgb(var(--color-border))]">
        {items.map((item) => (
          <NewsRow key={item.id} item={item} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 flex justify-center pb-8">
          <button
            onClick={loadMore}
            disabled={isPending}
            className="rounded-full border-2 border-[rgb(var(--color-text))] px-8 py-2.5 text-sm font-semibold text-[rgb(var(--color-text))] transition-all hover:bg-[rgb(var(--color-text))] hover:text-[rgb(var(--color-bg))] disabled:opacity-50"
          >
            {isPending ? 'Yükleniyor...' : 'Daha fazla haber'}
          </button>
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <p className="py-6 text-center text-xs text-[rgb(var(--color-text-muted))]">
          Tüm haberler gösterildi
        </p>
      )}
    </div>
  )
}
