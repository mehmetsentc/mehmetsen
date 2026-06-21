'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import type { VideoFeedItem } from '@/hooks/useVideoFeed'

interface VideoOverlayProps {
  video: VideoFeedItem
}

/**
 * haberler.com-style immersive overlay:
 * - "nahaber.com" vertical watermark at top-right
 * - Bold white title at bottom-left
 * - No author/avatar info (fully immersive)
 */
export function VideoOverlay({ video }: VideoOverlayProps) {
  return (
    <>
      {/* Vertical "nahaber.com" watermark — top-right */}
      <div
        className="pointer-events-none absolute right-3 top-6 z-20 origin-top-right select-none"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        aria-hidden
      >
        <span
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40"
          style={{ letterSpacing: '0.18em' }}
        >
          nahaber.com
        </span>
      </div>

      {/* Bottom gradient + title — biraz yukarıda (bottom nav'ın üstünde) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/40 to-transparent pb-20 pt-28">
        <div className="pointer-events-auto px-4 pr-20">
          {video.title && (
            <Link
              href={ROUTES.POST_DETAIL(video.id)}
              className="block"
            >
              <h2
                className="line-clamp-3 text-[17px] font-black leading-snug tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] sm:text-[19px]"
                style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85)' }}
              >
                {video.title}
              </h2>
            </Link>
          )}

          {/* Tags */}
          {video.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
              {video.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="text-xs font-semibold text-white/70 drop-shadow">
                  #{tag.replace(/^#/, '')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
