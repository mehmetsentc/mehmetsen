'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { hasVideoContent } from '@/lib/postUtils'
import { formatNewsRelative } from '@/components/home/desktop/formatNewsDate'
import {
  categoryPostHref,
  categoryPostImage,
} from '@/components/home/desktop/categoryPostUtils'
import { cn } from '@/lib/utils'
import type { TimelinePost } from '@/types/post'

function postIso(post: TimelinePost): string {
  const raw = post.publishedAt ?? post.createdAt
  return typeof raw === 'number' ? new Date(raw).toISOString() : String(raw)
}

function RailCard({ post, priority = false }: { post: TimelinePost; priority?: boolean }) {
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const isVideo = hasVideoContent(post)
  const label = getCategoryLabel(post.categoryId)
  const time = formatNewsRelative(postIso(post))

  return (
    <Link href={categoryPostHref(post)} className="category-rail-card group">
      <div className="category-rail-card__media">
        <SafeNewsImage
          src={image}
          alt={post.title}
          fill
          sizes="(max-width: 640px) 78vw, 280px"
          priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
        />
        <div className="category-rail-card__scrim" />
        {label ? <span className="category-rail-card__badge">{label}</span> : null}
        {isVideo ? (
          <span className="category-rail-card__play">
            <Play className="h-4 w-4 fill-white" />
          </span>
        ) : null}
        <div className="category-rail-card__body">
          <h3 className="category-rail-card__title">{post.title}</h3>
          {time ? <span className="category-rail-card__meta">{time}</span> : null}
        </div>
      </div>
    </Link>
  )
}

interface CategoryStoryRailProps {
  posts: TimelinePost[]
  title?: string
  accentRgb?: string
  priority?: boolean
  className?: string
}

/**
 * Horizontal, snap-scrolling rail of story cards. Swipeable on touch, with
 * arrow controls on hover for pointer devices. Used for "Keşfet" / trend rows.
 */
export function CategoryStoryRail({
  posts,
  title,
  accentRgb,
  priority = false,
  className,
}: CategoryStoryRailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 8)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }, [])

  useEffect(() => {
    updateArrows()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', updateArrows, { passive: true })
    window.addEventListener('resize', updateArrows)
    return () => {
      el.removeEventListener('scroll', updateArrows)
      window.removeEventListener('resize', updateArrows)
    }
  }, [updateArrows, posts.length])

  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: 'smooth' })
  }, [])

  if (posts.length === 0) return null

  const style = accentRgb
    ? ({ ['--rail-accent' as string]: accentRgb } as React.CSSProperties)
    : undefined

  return (
    <section className={cn('category-rail', className)} style={style} aria-label={title}>
      {title ? (
        <div className="category-rail__head">
          <h3 className="category-rail__title">{title}</h3>
          <div className="category-rail__controls" aria-hidden>
            <button
              type="button"
              className="category-rail__btn"
              disabled={!canLeft}
              onClick={() => scrollBy(-1)}
              aria-label="Geri"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="category-rail__btn"
              disabled={!canRight}
              onClick={() => scrollBy(1)}
              aria-label="İleri"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div ref={scrollerRef} className="category-rail__scroller scrollbar-hide">
        {posts.map((post, i) => (
          <RailCard key={post.id} post={post} priority={priority && i < 2} />
        ))}
      </div>
    </section>
  )
}
