'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Eye } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { useFollow } from '@/hooks/useFollow'
import { formatCount } from '@/lib/postUtils'
import type { VideoFeedItem } from '@/hooks/useVideoFeed'

interface VideoOverlayProps {
  video: VideoFeedItem
}

function ReelsFollowLink({ targetUserId }: { targetUserId: string }) {
  const { user } = useAuth()
  const { following, loading, toggle } = useFollow(user?.uid, targetUserId, false)

  if (!user) return null

  return (
    <button
      type="button"
      onClick={() => toggle()}
      disabled={loading}
      className="shrink-0 text-xs font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50"
    >
      {following ? 'Takiptesin' : 'Takip Et'}
    </button>
  )
}

export function VideoOverlay({ video }: VideoOverlayProps) {
  const { user } = useAuth()
  const isOwnProfile = user?.uid === video.authorId
  const caption = [video.summary, video.content]
    .map((text) => text?.trim())
    .find((text) => text && text !== video.title.trim())
  const hashtags = video.tags?.length
    ? video.tags.slice(0, 6)
    : video.title
        .split(/\s+/)
        .filter((w) => w.startsWith('#'))
        .map((w) => w.slice(1))
        .slice(0, 6)

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent pb-4 pt-20">
        <div className="pointer-events-auto px-3 sm:px-4">
          <div className="mb-2 flex items-center gap-2.5">
            <Link
              href={ROUTES.PROFILE(video.authorUsername)}
              className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/80 bg-blue-100"
            >
              {video.authorPhotoURL ? (
                <Image
                  src={video.authorPhotoURL}
                  alt={video.authorDisplayName}
                  fill
                  className="object-cover"
                  sizes="36px"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-bold text-blue-600">
                  {video.authorDisplayName[0]?.toUpperCase()}
                </span>
              )}
            </Link>
            <Link
              href={ROUTES.PROFILE(video.authorUsername)}
              className="min-w-0 truncate text-sm font-semibold text-white drop-shadow"
            >
              {video.authorUsername}
            </Link>
            {user && !isOwnProfile && video.authorId && (
              <ReelsFollowLink targetUserId={video.authorId} />
            )}
          </div>

          {video.title && (
            <p className="mb-1 line-clamp-2 text-sm font-medium leading-snug text-white drop-shadow">
              {video.title}
            </p>
          )}

          {caption && caption !== video.title && (
            <p className="line-clamp-3 text-sm leading-snug text-white/90 drop-shadow">{caption}</p>
          )}

          {hashtags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
              {hashtags.slice(0, 6).map((tag) => (
                <span key={tag} className="text-sm font-medium text-white/90 drop-shadow">
                  #{tag.replace(/^#/, '')}
                </span>
              ))}
            </div>
          )}

          {video.viewsCount > 0 && (
            <div className="mt-2 flex items-center gap-1 text-white/70">
              <Eye className="h-3.5 w-3.5" />
              <span className="text-xs">{formatCount(video.viewsCount)} görüntülenme</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
