'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, Zap } from 'lucide-react'
import type { FeedSliderItem } from '@/types/feedSlider'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { useBreakingNews } from '@/hooks/useBreakingNews'
import { NewsSlider } from './NewsSlider'
import { FeedSliderHero } from './FeedSliderHero'

function postToSliderItem(post: Post): FeedSliderItem {
  const imageUrl =
    post.coverImageUrl?.trim() ||
    post.mediaItems?.find((m) => m.type === 'image')?.url?.trim() ||
    null

  return {
    id: post.id,
    title: post.title,
    slug: post.slug?.trim() || post.id,
    imageUrl: imageUrl && imageUrl.length > 5 ? imageUrl : null,
    categoryId: post.categoryId ?? 'son-dakika',
    publishedAt: Date.parse(post.publishedAt ?? post.createdAt) || Date.now(),
    sourceUrl: post.sourceUrl ?? null,
  }
}

interface BreakingNewsSliderProps {
  initialItems: FeedSliderItem[]
}

/** Mobilde ana feed üstü — canlı son dakika carousel. */
export function BreakingNewsSlider({ initialItems }: BreakingNewsSliderProps) {
  const { posts, loading } = useBreakingNews()

  const items = useMemo(() => {
    if (posts.length > 0) return posts.map(postToSliderItem)
    return initialItems
  }, [posts, initialItems])

  if (!loading && items.length === 0) return null

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-red-500" />
          <span className="text-sm font-bold text-[rgb(var(--color-text))]">Son Dakika</span>
        </div>
        <Link
          href={ROUTES.CATEGORY('son-dakika')}
          className="flex items-center gap-0.5 text-xs font-semibold text-red-500"
        >
          Tümü
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <NewsSlider initialItems={items} variant="breaking">
        {initialItems[0] ? <FeedSliderHero item={initialItems[0]} variant="breaking" /> : null}
      </NewsSlider>
    </div>
  )
}
