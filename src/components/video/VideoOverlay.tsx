'use client'

import Link from 'next/link'
import { Volume2, VolumeX } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import type { VideoFeedItem } from '@/hooks/useVideoFeed'

interface VideoOverlayProps {
  video: VideoFeedItem
  muted: boolean
  onToggleMute: () => void
}

export function VideoOverlay({ video, muted, onToggleMute }: VideoOverlayProps) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/30 to-transparent pb-6 pt-24">
        <div className="pointer-events-auto max-w-[calc(100%-4.5rem)] px-4 sm:max-w-[calc(100%-5rem)]">
          <Link
            href={ROUTES.PROFILE(video.authorUsername)}
            className="mb-2 inline-flex items-center gap-2"
          >
            <span className="text-sm font-bold text-white drop-shadow">
              @{video.authorUsername}
            </span>
            {video.authorDisplayName && (
              <span className="text-sm text-white/80 drop-shadow">
                · {video.authorDisplayName}
              </span>
            )}
          </Link>

          {video.title && (
            <p className="mb-1 line-clamp-2 text-sm font-medium text-white drop-shadow">
              {video.title}
            </p>
          )}

          {video.summary && (
            <p className="line-clamp-2 text-sm text-white/90 drop-shadow">{video.summary}</p>
          )}

          {video.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {video.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="text-sm font-medium text-white/90 drop-shadow">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
        className="absolute right-3 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 sm:top-6"
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>
    </>
  )
}
