'use client'

import Link from 'next/link'
import { Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { formatNewsClock } from '@/components/home/desktop/formatNewsDate'
import type { TimelinePost } from '@/types/post'
import type { NewsItem } from '@/types/newsItem'
import { hasVideoContent } from '@/lib/postUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import {
  categoryPostHref,
  categoryPostImage,
} from '@/components/home/desktop/categoryPostUtils'

interface CardProps {
  href: string
  image: string
  title: string
  timestamp?: number | string
  isVideo?: boolean
  priority?: boolean
}

function FeedCard({ href, image, title, timestamp, isVideo, priority }: CardProps) {
  const time = formatNewsClock(timestamp)

  return (
    <article className="sd-card">
      <Link href={href} className="group block">
        {time ? (
          <p className="sd-card__time">
            <span className="sd-card__dot" aria-hidden="true" />
            {time}
          </p>
        ) : null}

        <h3 className="sd-card__title">{title}</h3>

        <div className="sd-card__media" style={{ aspectRatio: '16/9', position: 'relative' }}>
          <SafeNewsImage
            src={image}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 640px"
            priority={priority}
            fetchPriority={priority ? 'high' : 'auto'}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.01]"
          />
          {isVideo ? (
            <span className="sd-card__play" aria-label="Video">
              <Play className="h-4 w-4 fill-white" />
            </span>
          ) : null}
        </div>
      </Link>
    </article>
  )
}

/** SonDakika-style card for TimelinePost (category / yerel pages). */
export function MobileFeedCard({
  post,
  priority = false,
}: {
  post: TimelinePost
  priority?: boolean
}) {
  const raw = post.publishedAt ?? post.createdAt
  const ts = typeof raw === 'number' ? raw : Date.parse(String(raw)) || Date.now()

  return (
    <FeedCard
      href={categoryPostHref(post)}
      image={categoryPostImage(post) || FEED_FALLBACK_LOGO}
      title={post.title}
      timestamp={ts}
      isVideo={hasVideoContent(post)}
      priority={priority}
    />
  )
}

/** SonDakika-style card for NewsItem (homepage / load-more). */
export function MobileFeedCardNews({
  item,
  priority = false,
}: {
  item: NewsItem
  priority?: boolean
}) {
  return (
    <FeedCard
      href={newsItemDetailHref(item)}
      image={item.imageUrl || FEED_FALLBACK_LOGO}
      title={item.title}
      timestamp={item.publishedAt ?? item.createdAt}
      isVideo={Boolean(item.videoUrl)}
      priority={priority}
    />
  )
}
