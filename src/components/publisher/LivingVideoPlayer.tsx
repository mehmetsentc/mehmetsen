'use client'

import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { cn } from '@/lib/utils'
import { useLivingVideoQualification } from '@/hooks/useLivingVideoQualification'

interface LivingVideoPlayerProps {
  /** Stable id for the single-active-owner coordinator — the article id is used. */
  id: string
  videoUrl: string
  posterUrl: string | null
  alt: string
  categoryLabel?: string | null
  /** 'masonry' cards let height come from the image (break-inside-avoid column
   * layout); 'fixed' cards (grid/lead) need an explicit aspect box so <video>
   * has a nonzero box before metadata loads. */
  layout?: 'masonry' | 'fixed'
  className?: string
}

/**
 * LP7R.2 Living Video presentational component. All qualification/state
 * logic lives in useLivingVideoQualification + src/lib/livingVideo/* — this
 * component only renders whatever that hook reports. See qualification.ts
 * for the full state list and why each one exists (Task 7).
 */
export function LivingVideoPlayer({
  id,
  videoUrl,
  posterUrl,
  alt,
  categoryLabel,
  layout = 'fixed',
  className,
}: LivingVideoPlayerProps) {
  const {
    containerRef,
    videoRef,
    state,
    isNearViewport,
    onLoadedMetadata,
    onError,
    requestPlay,
    requestPause,
    requestUnmute,
  } = useLivingVideoQualification(id)

  const failed = state === 'failed'
  // Mount the <video> element only once we're near the viewport (Task 6:
  // "far from viewport -> poster only" means no decoder exists yet at all,
  // not just preload="none" on an already-mounted element).
  const mountVideo = !failed && state !== 'poster'
  const isPlaying = state === 'autoplay-muted' || state === 'playing-with-sound'
  const showBlockedControl = state === 'blocked'

  return (
    <div
      ref={containerRef}
      className={cn(
        // Spacing/break-inside-avoid for masonry layout is owned by the
        // caller's outer wrapping element (matching how the plain
        // image-only card already works) so it's never duplicated between
        // this container and its parent.
        'relative w-full overflow-hidden bg-[rgb(var(--color-bg))]',
        layout === 'fixed' ? 'aspect-video' : '',
        className
      )}
    >
      {posterUrl ? (
        <SafeNewsImage
          src={posterUrl}
          alt={alt}
          width={640}
          height={480}
          className={cn(
            'h-auto w-full object-cover transition-opacity duration-300',
            isPlaying ? 'opacity-0' : 'opacity-100',
            layout === 'fixed' ? 'absolute inset-0 h-full' : ''
          )}
        />
      ) : (
        <div className="flex min-h-[120px] w-full items-center justify-center p-4">
          <span className="rounded-md bg-[rgb(var(--color-border))] px-2.5 py-1 text-xs font-bold text-[rgb(var(--color-muted))]">
            {categoryLabel ?? 'VİDEO'}
          </span>
        </div>
      )}

      {mountVideo ? (
        <video
          ref={videoRef}
          src={videoUrl}
          preload={isNearViewport ? 'metadata' : 'none'}
          playsInline
          muted
          loop
          aria-hidden={!isPlaying}
          tabIndex={-1}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
            isPlaying ? 'opacity-100' : 'opacity-0'
          )}
          onLoadedMetadata={onLoadedMetadata}
          onError={onError}
        />
      ) : null}

      {categoryLabel ? (
        <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white backdrop-blur-sm">
          {categoryLabel}
        </span>
      ) : null}

      {showBlockedControl ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            requestPlay()
          }}
          aria-label="Videoyu oynat"
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-black">
            <Play className="h-5 w-5 translate-x-0.5" aria-hidden />
          </span>
        </button>
      ) : null}

      {isPlaying ? (
        <div className="absolute bottom-3 right-3 flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (state === 'autoplay-muted') requestUnmute()
            }}
            aria-label={state === 'autoplay-muted' ? 'Sesi aç' : 'Ses açık'}
            aria-pressed={state === 'playing-with-sound'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {state === 'autoplay-muted' ? (
              <VolumeX className="h-4 w-4" aria-hidden />
            ) : (
              <Volume2 className="h-4 w-4" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              requestPause()
            }}
            aria-label="Videoyu duraklat"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Pause className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  )
}
