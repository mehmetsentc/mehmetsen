'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatNewsDateBbc } from '@/components/home/desktop/formatNewsDate'
import {
  categoryPostHref,
  categoryPostImage,
  categoryPostSummary,
} from '@/components/home/desktop/categoryPostUtils'
import type { Post, TimelinePost } from '@/types/post'

interface ProfileMostReadProps {
  posts: Post[]
  title?: string
}

export function ProfileMostRead({
  posts,
  title = 'En çok okunanlar',
}: ProfileMostReadProps) {
  const topPosts = useMemo(() => {
    return [...posts]
      .filter((p) => (p.viewsCount ?? 0) > 0 || posts.length <= 20)
      .sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0))
      .slice(0, 10)
  }, [posts])

  if (topPosts.length < 2) return null

  return (
    <section className="mb-4 min-w-0" aria-label={title}>
      <div className="flex items-center gap-2 pb-3">
        <TrendingUp className="h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" />
        <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">{title}</h2>
      </div>
      <div className="profile-most-read-track -mx-[max(var(--layout-gutter),env(safe-area-inset-left,0px))] px-[max(var(--layout-gutter),env(safe-area-inset-left,0px))] sm:mx-0 sm:px-0 lg:mx-0 lg:px-0">
        {topPosts.map((post) => (
          <MostReadCard key={post.id} post={post as TimelinePost} />
        ))}
      </div>
    </section>
  )
}

function MostReadCard({ post }: { post: TimelinePost }) {
  const href = categoryPostHref(post)
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const label = getCategoryLabel(post.categoryId)
  const time = formatNewsDateBbc(
    typeof post.publishedAt === 'number'
      ? new Date(post.publishedAt).toISOString()
      : String(post.publishedAt ?? post.createdAt)
  )

  return (
    <Link
      href={href}
      className="group flex w-[220px] min-w-[220px] flex-col overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm transition-shadow hover:shadow-md sm:w-[260px] sm:min-w-[260px] md:w-[280px] md:min-w-[280px]"
    >
      <div className="relative aspect-[3/2] w-full overflow-hidden bg-[rgb(var(--color-border))]">
        <SafeNewsImage
          src={image}
          alt={post.title}
          fill
          sizes="280px"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {label && (
          <span className="absolute left-2 top-2 z-10 rounded bg-[rgb(var(--color-brand))]/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {label}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[rgb(var(--color-text))]">
          {post.title}
        </h3>
        {time && (
          <span className="mt-auto text-[11px] text-[rgb(var(--color-muted))]">{time}</span>
        )}
      </div>
    </Link>
  )
}
