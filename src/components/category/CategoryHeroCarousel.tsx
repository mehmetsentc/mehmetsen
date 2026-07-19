'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Play } from 'lucide-react'
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

function HeroSlide({ post, priority }: { post: TimelinePost; priority: boolean }) {
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const isVideo = hasVideoContent(post)
  const label = getCategoryLabel(post.categoryId)
  const time = formatNewsRelative(postIso(post))

  return (
    <Link href={categoryPostHref(post)} className="category-hero-slide">
      <SafeNewsImage
        src={image}
        alt={post.title}
        fill
        sizes="100vw"
        priority={priority}
        className="object-cover"
      />
      <div className="category-hero-slide__scrim" />
      {isVideo ? (
        <span className="category-hero-slide__play">
          <Play className="h-5 w-5 fill-white" />
        </span>
      ) : null}
      <div className="category-hero-slide__body">
        {label ? <span className="category-hero-slide__badge">{label}</span> : null}
        <h2 className="category-hero-slide__title">{post.title}</h2>
        {time ? <span className="category-hero-slide__meta">{time}</span> : null}
      </div>
    </Link>
  )
}

interface CategoryHeroCarouselProps {
  posts: TimelinePost[]
  accentRgb?: string
  priority?: boolean
}

/** Swipeable, full-width hero carousel for the top of mobile category pages. */
export function CategoryHeroCarousel({
  posts,
  accentRgb,
  priority = false,
}: CategoryHeroCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    setActive((prev) => (prev === idx ? prev : idx))
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onScroll])

  const goTo = useCallback((idx: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' })
  }, [])

  if (posts.length === 0) return null

  const style = accentRgb
    ? ({ ['--rail-accent' as string]: accentRgb } as React.CSSProperties)
    : undefined

  return (
    <div className="category-hero-carousel" style={style} data-no-category-swipe>
      <div ref={scrollerRef} className="category-hero-carousel__scroller scrollbar-hide">
        {posts.map((post, i) => (
          <div key={post.id} className="category-hero-carousel__item">
            <HeroSlide post={post} priority={priority && i === 0} />
          </div>
        ))}
      </div>
      {posts.length > 1 ? (
        <div className="category-hero-carousel__dots" role="tablist" aria-label="Öne çıkan haberler">
          {posts.map((post, i) => (
            <button
              key={post.id}
              type="button"
              className={cn('category-hero-carousel__dot', i === active && 'is-active')}
              onClick={() => goTo(i)}
              aria-label={`${i + 1}. haber`}
              aria-selected={i === active}
              role="tab"
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
