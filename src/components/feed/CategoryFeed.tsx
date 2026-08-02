'use client'

import { useMemo } from 'react'
import { CategoryLoadMore } from '@/components/category/CategoryLoadMore'
import type { TimelinePost } from '@/types/post'
import type { NewsItem } from '@/types/newsItem'

interface CategoryFeedProps {
  categoryId: string
  initialPosts?: TimelinePost[]
}

function toNewsItem(post: TimelinePost): NewsItem {
  const pubMs =
    typeof post.publishedAt === 'number'
      ? post.publishedAt
      : post.publishedAt
        ? Date.parse(String(post.publishedAt))
        : null
  return {
    id: post.id,
    slug: post.slug ?? post.id,
    title: post.title ?? '',
    description: post.spot?.trim().slice(0, 120) || undefined,
    imageUrl: post.coverImageUrl ?? undefined,
    publishedAt: pubMs ? new Date(pubMs).toISOString() : undefined,
    category: post.categoryId ?? undefined,
    breaking: post.isBreaking ?? false,
  }
}

export function CategoryFeed({ categoryId, initialPosts = [] }: CategoryFeedProps) {
  const items: NewsItem[] = useMemo(() => initialPosts.map(toNewsItem), [initialPosts])

  // Compute cursor from last item's publishedAt for "load more"
  const last = items[items.length - 1]
  const initialCursor = last?.publishedAt ? String(Date.parse(last.publishedAt)) : null

  return (
    <CategoryLoadMore
      categoryId={categoryId}
      initialItems={items}
      initialCursor={initialCursor}
      initialHasMore={items.length >= 20}
    />
  )
}
