'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Clapperboard, Newspaper } from 'lucide-react'
import type { Post } from '@/types/post'
import { getPrimaryVideo, getPostDetailHref, hasVideoContent } from '@/lib/postUtils'

interface ProfileGridProps {
  posts: Post[]
  loading?: boolean
  emptyMessage?: string
}

export function ProfileGrid({ posts, loading, emptyMessage = 'Henüz içerik yok' }: ProfileGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="aspect-square animate-pulse bg-[rgb(var(--color-border))]" />
        ))}
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Newspaper className="profile-empty-icon mb-3 h-10 w-10" />
        <p className="text-sm text-[rgb(var(--color-muted))]">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-0.5 p-0.5 sm:grid-cols-3">
      {posts.map((post) => {
        const isVideo = hasVideoContent(post)
        const href = getPostDetailHref(post)
        const videoMedia = getPrimaryVideo(post)
        const imageUrl =
          post.coverImageUrl ||
          videoMedia?.thumbnailUrl ||
          post.mediaItems?.find((m) => m.type === 'image')?.url ||
          null
        const videoUrl = isVideo ? videoMedia?.url : null
        const hasMedia = Boolean(imageUrl || videoUrl)

        return (
          <Link
            key={post.id}
            href={href}
            className="group relative aspect-square overflow-hidden bg-[rgb(var(--color-surface))]"
          >
            {videoUrl ? (
              <video
                src={videoUrl}
                poster={imageUrl ?? undefined}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            ) : imageUrl ? (
              <Image
                src={imageUrl}
                alt={post.title}
                fill
                className="object-cover transition-transform group-hover:scale-105"
                sizes="(max-width: 768px) 33vw, 200px"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[rgb(var(--color-surface))] p-2 text-center">
                <p className="line-clamp-3 text-xs font-medium text-[rgb(var(--color-muted))]">
                  {post.title}
                </p>
              </div>
            )}
            {isVideo && hasMedia && (
              <span className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white">
                <Clapperboard className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
          </Link>
        )
      })}
    </div>
  )
}
