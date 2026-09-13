'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { formatPublicSourceLabel } from '@/lib/postUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatPublishedAt } from '@/lib/publisher/editorialTiers'
import type { VideoFeedSurface } from '@/lib/videoFeed/types'
import type { VideoFeedItem } from '@/hooks/useVideoFeed'

interface VideoOverlayProps {
  video: VideoFeedItem
  surface?: VideoFeedSurface
}

/**
 * haberler.com-style immersive overlay:
 * - "nahaber.com" vertical watermark at top-right
 * - Bold white title at bottom-left
 * - /video surface adds source, summary, category, time, Haberi Oku
 */
export function VideoOverlay({ video, surface = 'reels' }: VideoOverlayProps) {
  const source = formatPublicSourceLabel(video.source)
  const category = getCategoryLabel(video.categoryId)
  const published = formatPublishedAt(video.publishedAt ? new Date(video.publishedAt) : null)
  const summary = (video.summary || video.feedTeaser || '').trim()
  const slug = video.slug?.trim() || video.id
  const articleHref = ROUTES.NEWS_DETAIL(slug)

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
          {surface === 'video' && source ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/70 drop-shadow">
              {source}
            </p>
          ) : null}

          {video.title && (
            <Link
              href={surface === 'video' ? articleHref : ROUTES.POST_DETAIL(video.id)}
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

          {surface === 'video' && summary ? (
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-white/75 drop-shadow">
              {summary}
            </p>
          ) : null}

          {surface === 'video' ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-white/65">
              {category ? <span>{category}</span> : null}
              {category && published ? <span aria-hidden>·</span> : null}
              {published ? <time dateTime={video.publishedAt ?? undefined}>{published}</time> : null}
            </div>
          ) : null}

          {surface === 'video' ? (
            <Link
              href={articleHref}
              className="mt-3 inline-flex items-center rounded-full bg-white px-4 py-1.5 text-xs font-bold text-black shadow"
            >
              Haberi Oku
            </Link>
          ) : null}

          {surface !== 'video' && video.tags?.length > 0 && (
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
