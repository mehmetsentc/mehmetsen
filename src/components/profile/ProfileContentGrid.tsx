'use client'

import Link from 'next/link'
import { Newspaper } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { getPostDetailHref } from '@/lib/postUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import type { Post } from '@/types/post'

interface ProfileContentGridProps {
  posts: Post[]
  loading?: boolean
  emptyMessage?: string
}

export function ProfileContentGrid({
  posts,
  loading,
  emptyMessage = 'Henüz içerik yok',
}: ProfileContentGridProps) {
  if (loading) {
    return (
      <div className="nah-profile-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="nah-profile-grid__card animate-pulse bg-white/5" />
        ))}
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Newspaper className="mb-3 h-10 w-10 text-white/25" />
        <p className="text-sm text-[rgb(var(--nah-text-muted))]">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="nah-profile-grid" data-testid="profile-content-grid">
      {posts.map((post) => {
        const href = getPostDetailHref(post)
        const image = post.coverImageUrl || FEED_FALLBACK_LOGO
        const category = post.categoryId ? getCategoryLabel(post.categoryId) : null
        return (
          <Link key={post.id} href={href} className="nah-profile-grid__card block">
            <SafeNewsImage
              src={image}
              alt={post.title}
              fill
              sizes="33vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
            {category ? (
              <span className="absolute left-1.5 top-1.5 rounded bg-[rgb(var(--nah-red))] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
                {category}
              </span>
            ) : null}
            <p className="absolute inset-x-1.5 bottom-1.5 line-clamp-3 text-[11px] font-bold leading-snug text-white">
              {post.title}
            </p>
          </Link>
        )
      })}
    </div>
  )
}
