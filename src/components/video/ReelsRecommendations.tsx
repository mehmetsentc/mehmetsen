'use client'

import Image from 'next/image'
import { Play } from 'lucide-react'
import { sortByEngagement } from '@/lib/engagementScore'
import { getPrimaryVideo, formatCount } from '@/lib/postUtils'
import { cn } from '@/lib/utils'
import type { VideoFeedItem } from '@/hooks/useVideoFeed'

interface ReelsRecommendationsProps {
  videos: VideoFeedItem[]
  activeIndex: number
  onSelect: (index: number) => void
  className?: string
}

export function ReelsRecommendations({
  videos,
  activeIndex,
  onSelect,
  className,
}: ReelsRecommendationsProps) {
  const recommended = sortByEngagement(
    videos
      .map((video, index) => ({ video, index }))
      .filter(({ index }) => index !== activeIndex)
      .map(({ video }) => video)
  )
    .slice(0, 10)
    .map((video) => ({
      video,
      index: videos.findIndex((v) => v.id === video.id),
    }))
    .filter(({ index }) => index >= 0)

  if (recommended.length === 0) return null

  return (
    <aside className={cn('reels-recommendations', className)} aria-label="Tavsiye videolar">
      <h2 className="reels-recommendations-title">Tavsiye videolar</h2>
      <div className="reels-recommendations-list hide-scrollbar">
        {recommended.map(({ video, index }) => {
          const media = getPrimaryVideo(video)
          const thumb =
            media?.thumbnailUrl || video.coverImageUrl || null
          const isActive = index === activeIndex

          return (
            <button
              key={video.id}
              type="button"
              onClick={() => onSelect(index)}
              className={cn(
                'reels-recommendation-item',
                isActive && 'reels-recommendation-item-active'
              )}
            >
              <div className="reels-recommendation-thumb">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="120px"
                  />
                ) : media?.url ? (
                  <video
                    src={media.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[rgb(var(--color-border))]">
                    <Play className="h-5 w-5 text-[rgb(var(--color-muted))]" />
                  </div>
                )}
                <span className="reels-recommendation-play">
                  <Play className="h-3 w-3 fill-white text-white" />
                </span>
              </div>

              <div className="min-w-0 flex-1 text-left">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--color-text))]">
                  {video.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-[rgb(var(--color-muted))]">
                  @{video.authorUsername}
                </p>
                <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">
                  {formatCount(video.likesCount)} beğeni · {formatCount(video.commentsCount)} yorum
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
