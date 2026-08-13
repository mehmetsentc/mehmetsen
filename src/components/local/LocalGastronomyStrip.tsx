'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, UtensilsCrossed } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { postService } from '@/services/postService'
import type { TimelinePost } from '@/types/post'

const STRIP_LIMIT = 6

/**
 * Shared national gastronomi strip for yerel city pages.
 * Same list for every city — not geo-owned by citySlug.
 */
export function LocalGastronomyStrip() {
  const [posts, setPosts] = useState<TimelinePost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void postService
      .getNewsTimeline(undefined, { categoryId: 'gastronomi', limit: STRIP_LIMIT })
      .then((result) => {
        if (cancelled) return
        setPosts(result.posts as TimelinePost[])
      })
      .catch(() => {
        if (!cancelled) setPosts([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <section className="mb-8" aria-label="Gastronomi" aria-busy="true">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-[rgb(var(--color-text))]">Gastronomi</p>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 w-40 shrink-0 animate-pulse rounded-xl bg-[rgb(var(--color-border))]"
            />
          ))}
        </div>
      </section>
    )
  }

  if (posts.length === 0) return null

  return (
    <section className="mb-8" aria-label="Gastronomi">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-[rgb(var(--color-muted))]" aria-hidden />
          <p className="text-sm font-bold text-[rgb(var(--color-text))]">Gastronomi</p>
        </div>
        <Link
          href={ROUTES.CATEGORY('gastronomi')}
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-brand))]"
        >
          Tümü
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {posts.map((post) => {
          const href = post.slug ? ROUTES.NEWS_DETAIL(post.slug) : ROUTES.CATEGORY('gastronomi')
          const image =
            post.coverImageUrl ||
            post.mediaItems?.find((m) => m.type === 'image')?.url ||
            null
          return (
            <Link
              key={post.id}
              href={href}
              className="flex w-[160px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-[rgb(var(--color-surface-elevated))]">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <UtensilsCrossed className="h-6 w-6 text-[rgb(var(--color-muted))]" />
                  </div>
                )}
              </div>
              <p className="line-clamp-3 px-2.5 py-2 text-[12px] font-semibold leading-snug text-[rgb(var(--color-text))]">
                {post.title}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
