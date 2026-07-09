'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { categoryPostHref, categoryPostImage, categoryPostSummary } from '@/components/home/desktop/categoryPostUtils'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { ROUTES } from '@/constants/routes'
import { hasVideoContent } from '@/lib/postUtils'
import type { TimelinePost } from '@/types/post'

interface DesktopCategoryWatchProps {
  posts: TimelinePost[]
  categorySlug: string
}

export function DesktopCategoryWatch({ posts, categorySlug }: DesktopCategoryWatchProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const videos = posts.filter((p) => hasVideoContent(p)).slice(0, 8)

  if (videos.length === 0) return null

  const scroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' })
  }

  return (
    <section className="desktop-category-watch mb-10 bg-[rgb(var(--color-text))] py-6 text-white" aria-label="Video haberler">
      <div className="mb-4 flex items-center justify-between px-1">
        <DesktopSectionHeader
          title="İzle"
          href={ROUTES.CATEGORY(categorySlug)}
          className="mb-0 border-t-0 pt-0 text-white hover:text-red-300"
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Önceki"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 transition-colors hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="Sonraki"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 transition-colors hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-4 overflow-x-auto px-1 pb-1 scrollbar-hide" data-no-category-swipe>
        {videos.map((post) => {
          const href = categoryPostHref(post)
          const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
          const summary = categoryPostSummary(post)
          return (
            <Link key={post.id} href={href} className="group w-[260px] shrink-0 snap-start">
              <div className="relative mb-3 aspect-video overflow-hidden bg-neutral-800">
                <SafeNewsImage src={image} alt={post.title} fill sizes="260px" className="object-cover group-hover:scale-[1.03] transition-transform" />
                <span className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/75">
                  <Play className="h-3.5 w-3.5 fill-white text-white" />
                </span>
              </div>
              <h3 className="line-clamp-2 text-sm font-bold leading-snug group-hover:underline">{post.title}</h3>
              {summary ? <p className="mt-1 line-clamp-2 text-xs text-white/70">{summary}</p> : null}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
