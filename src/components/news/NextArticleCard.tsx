'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatTimelineRelative } from '@/lib/timelineUtils'
import { hasVideoContent } from '@/lib/postUtils'
import type { Post } from '@/types/post'

interface NextArticleCardProps {
  nextPost: Post
}

/**
 * Sayfanın altında belirir: kullanıcı scroll'layınca IntersectionObserver tetiklenir,
 * "Sıradaki Haber" kartı görünür + otomatik odaklanır.
 */
export function NextArticleCard({ nextPost }: NextArticleCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const href = hasVideoContent(nextPost)
    ? ROUTES.REELS_VIDEO(nextPost.id)
    : nextPost.slug?.trim() && nextPost.slug !== nextPost.id
      ? ROUTES.NEWS_DETAIL(nextPost.slug)
      : ROUTES.POST_DETAIL(nextPost.id)

  const image = nextPost.coverImageUrl ?? nextPost.mediaItems?.find(m => m.type === 'image')?.url ?? null
  const catLabel = getCategoryLabel(nextPost.categoryId ?? 'gundem')
  const timeLabel = formatTimelineRelative(nextPost.publishedAt)

  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
    >
      {/* Ayırıcı */}
      <div className="my-8 flex items-center gap-3">
        <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[rgb(var(--color-muted))]">
          <ArrowRight className="h-3.5 w-3.5" />
          Sıradaki Haber
        </span>
        <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
      </div>

      {/* Büyük kart */}
      <Link
        href={href}
        className="group block overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] transition-all hover:border-[rgb(var(--color-brand))] hover:shadow-lg"
      >
        {/* Görsel */}
        {image && (
          <div className="relative aspect-[16/7] w-full overflow-hidden bg-[rgb(var(--color-border))]">
            <Image
              src={image}
              alt={nextPost.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 768px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            {/* Kategori badge */}
            <span className="absolute left-4 top-4 rounded-full bg-[rgb(var(--color-brand))] px-3 py-1 text-xs font-bold text-white">
              {catLabel}
            </span>
          </div>
        )}

        <div className="p-5">
          {!image && (
            <span className="mb-2 inline-block rounded-full bg-[rgb(var(--color-brand))]/15 px-3 py-0.5 text-xs font-bold text-[rgb(var(--color-brand))]">
              {catLabel}
            </span>
          )}
          <h3 className="text-xl font-black leading-snug text-[rgb(var(--color-text))] group-hover:text-[rgb(var(--color-brand))] transition-colors line-clamp-3">
            {nextPost.title}
          </h3>
          {nextPost.summary && (
            <p className="mt-2 line-clamp-2 text-sm text-[rgb(var(--color-muted))]">
              {nextPost.summary}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-[rgb(var(--color-muted))]">{timeLabel}</span>
            <span className="flex items-center gap-1 text-sm font-semibold text-[rgb(var(--color-brand))]">
              Haberi oku
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  )
}
