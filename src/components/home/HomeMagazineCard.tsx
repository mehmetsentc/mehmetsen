'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

function mediaUrls(item: NewsItem): string[] {
  const urls: string[] = []
  if (item.imageUrl) urls.push(item.imageUrl)
  for (const extra of item.additionalImages ?? []) {
    if (extra.url && !urls.includes(extra.url)) urls.push(extra.url)
  }
  return urls
}

type HomeMagazineCardProps = {
  item: NewsItem
  priority?: boolean
}

export function HomeMagazineCard({ item, priority = false }: HomeMagazineCardProps) {
  const images = mediaUrls(item)
  const href = newsItemDetailHref(item)
  const isVideo = Boolean(item.videoUrl)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const syncActive = useCallback(() => {
    const el = scrollerRef.current
    if (!el || images.length < 3) return
    const width = el.clientWidth
    if (width <= 0) return
    setActive(Math.round(el.scrollLeft / width))
  }, [images.length])

  const go = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' })
  }, [])

  const title = (
    <h3 className="mag-card__title">{item.title}</h3>
  )

  if (images.length >= 3) {
    return (
      <article className="mag-card" data-testid="magazine-card">
        <div className="mag-card__carousel">
          <div
            ref={scrollerRef}
            className="mag-card__carousel-scroller"
            onScroll={syncActive}
          >
            {images.map((src, index) => (
              <Link
                key={`${item.id}-${src}`}
                href={href}
                className="mag-card__carousel-slide"
              >
                <SafeNewsImage
                  src={src}
                  alt={item.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 720px"
                  priority={priority && index === 0}
                  fetchPriority={priority && index === 0 ? 'high' : 'low'}
                  className="object-cover"
                />
              </Link>
            ))}
          </div>
          <button
            type="button"
            aria-label="Önceki görsel"
            className="mag-card__nav mag-card__nav--prev"
            onClick={() => go(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Sonraki görsel"
            className="mag-card__nav mag-card__nav--next"
            onClick={() => go(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {isVideo ? (
            <span className="mag-card__play" aria-label="Video">
              <Play className="h-4 w-4 fill-white" />
            </span>
          ) : null}
        </div>
        <div className="mag-card__dots" aria-hidden>
          {images.map((src, index) => (
            <span
              key={`${src}-dot`}
              className={cn('mag-card__dot', index === active && 'is-active')}
            />
          ))}
        </div>
        <Link href={href} className="mag-card__copy">
          {title}
        </Link>
      </article>
    )
  }

  if (images.length === 2) {
    return (
      <article className="mag-card" data-testid="magazine-card">
        <Link href={href} className="mag-card__pair">
          {images.map((src) => (
            <span key={src} className="mag-card__pair-cell">
              <SafeNewsImage
                src={src}
                alt={item.title}
                fill
                sizes="(max-width: 768px) 50vw, 360px"
                priority={priority}
                fetchPriority={priority ? 'high' : 'low'}
                className="object-cover"
              />
            </span>
          ))}
          {isVideo ? (
            <span className="mag-card__play" aria-label="Video">
              <Play className="h-4 w-4 fill-white" />
            </span>
          ) : null}
        </Link>
        <Link href={href} className="mag-card__copy">
          {title}
        </Link>
      </article>
    )
  }

  return (
    <article className="mag-card" data-testid="magazine-card">
      <Link href={href} className="mag-card__media">
        <SafeNewsImage
          src={images[0] || FEED_FALLBACK_LOGO}
          alt={item.title}
          fill
          sizes="(max-width: 768px) 100vw, 720px"
          priority={priority}
          fetchPriority={priority ? 'high' : 'low'}
          className="object-cover"
        />
        {isVideo ? (
          <span className="mag-card__play" aria-label="Video">
            <Play className="h-4 w-4 fill-white" />
          </span>
        ) : null}
      </Link>
      <Link href={href} className="mag-card__copy">
        {title}
      </Link>
    </article>
  )
}
