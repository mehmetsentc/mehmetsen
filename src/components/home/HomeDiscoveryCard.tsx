'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Heart, Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO, getCategoryFallbackGradient } from '@/lib/feedMediaUtils'
import { formatCount, formatPublicSourceLabel } from '@/lib/postUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import {
  categoryPostHref,
  categoryPostImage,
} from '@/components/home/desktop/categoryPostUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { saveArticleNav } from '@/lib/articleNavContext'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'
import type { TimelinePost } from '@/types/post'

export type HomeDiscoveryItem = {
  id: string
  href: string
  title: string
  imageUrl?: string
  categoryId?: string
  categoryLabel?: string
  source?: string
  likesCount?: number
  videoUrl?: string
  featured?: boolean
}

/** Natural card height from media treatment + slot — not random, not identical. */
export function discoveryAspectRatio(index: number, featured: boolean): string {
  if (featured) {
    if (index === 0) return '4 / 5'
    if (index === 1) return '3 / 4'
    return index % 2 === 0 ? '4 / 5' : '5 / 6'
  }
  const cycle = ['4 / 5', '3 / 4', '1 / 1', '5 / 6'] as const
  return cycle[index % cycle.length]!
}

export function newsItemToDiscovery(item: NewsItem): HomeDiscoveryItem {
  return {
    id: item.id,
    href: newsItemDetailHref(item),
    title: item.title,
    imageUrl: item.imageUrl,
    categoryId: item.category,
    categoryLabel: newsItemCategoryLabel(item),
    source: formatPublicSourceLabel(item.source),
    likesCount: item.likesCount,
    videoUrl: item.videoUrl,
    featured: item.featured === true,
  }
}

export function timelinePostToDiscovery(post: TimelinePost): HomeDiscoveryItem {
  return {
    id: post.id,
    href: categoryPostHref(post),
    title: post.title,
    imageUrl: categoryPostImage(post) || undefined,
    categoryId: post.categoryId,
    categoryLabel: getCategoryLabel(post.categoryId),
    source: formatPublicSourceLabel(post.source),
    likesCount: post.likesCount,
    featured: post.featured === true,
  }
}

type HomeDiscoveryCardProps = {
  item: HomeDiscoveryItem
  index: number
  featured?: boolean
  priority?: boolean
  hrefs?: string[]
  navSource?: 'featured' | 'feed' | 'category'
}

export function HomeDiscoveryCard({
  item,
  index,
  featured = false,
  priority = false,
  hrefs,
  navSource = 'feed',
}: HomeDiscoveryCardProps) {
  const [mediaFailed, setMediaFailed] = useState(false)
  const aspect = discoveryAspectRatio(index, featured)
  const src = !mediaFailed && item.imageUrl?.trim() ? item.imageUrl.trim() : ''
  const showFallback = !src
  const likes = typeof item.likesCount === 'number' && item.likesCount > 0 ? item.likesCount : 0

  return (
    <article
      className="exp-slot home-discovery-slot"
      data-testid={index === 0 ? 'home-discovery-first' : 'home-discovery-card'}
      data-discovery-featured={featured ? '1' : '0'}
      data-discovery-id={item.id}
    >
      <Link
        href={item.href}
        className="home-discovery-card group"
        onClick={() => {
          if (hrefs && hrefs.length > 0) {
            const navIndex = hrefs.indexOf(item.href)
            saveArticleNav({
              hrefs,
              index: navIndex >= 0 ? navIndex : 0,
              source: featured ? 'featured' : navSource,
            })
          }
        }}
      >
        <div
          className="home-discovery-card__media"
          style={{ aspectRatio: aspect }}
        >
          <div
            className="absolute inset-0"
            style={{ background: getCategoryFallbackGradient(item.categoryId) }}
            aria-hidden
          />
          {showFallback ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={FEED_FALLBACK_LOGO}
              alt=""
              className="absolute inset-0 h-full w-full object-contain p-8 opacity-80"
            />
          ) : (
            <SafeNewsImage
              src={src}
              alt={item.title}
              fill
              sizes="(max-width: 1023px) 48vw, 24vw"
              priority={priority}
              fetchPriority={priority ? 'high' : 'auto'}
              className="object-cover object-center"
              onLoadError={() => setMediaFailed(true)}
            />
          )}
          <div className="home-discovery-card__scrim" aria-hidden />
          {item.videoUrl ? (
            <span className="home-discovery-card__play" aria-label="Video">
              <Play className="h-3.5 w-3.5 fill-white" />
            </span>
          ) : null}
          <div className="home-discovery-card__copy">
            {item.categoryLabel ? (
              <p className="home-discovery-card__kicker">{item.categoryLabel}</p>
            ) : null}
            <h3 className="home-discovery-card__headline">{item.title}</h3>
            <p className="home-discovery-card__meta">
              {item.source ? <span>{item.source}</span> : null}
              {likes > 0 ? (
                <span className={cn('inline-flex items-center gap-0.5', item.source && 'ml-2')}>
                  <Heart className="h-3 w-3 fill-white" aria-hidden />
                  {formatCount(likes)}
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </Link>
    </article>
  )
}
