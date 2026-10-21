'use client'

import { Play } from 'lucide-react'
import type { FeedCardVideo } from '@/lib/videoFeed/feedCardVideo'

/** ARTICLE-VIDEO-1: embed URL that starts playing inline (phones need playsinline). */
export function readerVideoEmbedSrc(video: FeedCardVideo): string | null {
  if (video.kind === 'youtube') return `https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
  if (video.kind === 'vimeo') return `https://player.vimeo.com/video/${video.videoId}?autoplay=1&playsinline=1`
  if (video.kind === 'dailymotion') return `https://www.dailymotion.com/embed/video/${video.videoId}?autoplay=1`
  return null
}

/** Fills its (relative) parent: native MP4 or the provider's embed, playing inline. */
export function ReaderVideoPlayer({
  video,
  poster,
  title,
  autoPlay = true,
}: {
  video: FeedCardVideo
  poster?: string | null
  title: string
  /** False when the player is shown without a tap (no cover photo). */
  autoPlay?: boolean
}) {
  const embed = readerVideoEmbedSrc(video)
  const src = embed && !autoPlay ? embed.replace(/autoplay=1&?/, '').replace(/[?&]$/, '') : embed
  if (src) {
    return (
      <iframe
        src={src}
        title={title}
        className="absolute inset-0 h-full w-full border-0 bg-black"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        data-testid="feed-reader-video-embed"
      />
    )
  }
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={video.url}
      poster={poster ?? undefined}
      controls
      autoPlay={autoPlay}
      playsInline
      preload="metadata"
      className="absolute inset-0 h-full w-full bg-black object-contain"
      data-testid="feed-reader-video"
    />
  )
}

/** Corner play control on the reader hero image — same look as the article page. */
export function ReaderVideoPlayButton({ onPlay }: { onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onPlay()
      }}
      aria-label="Videoyu oynat"
      data-testid="feed-reader-video-play"
      className="absolute bottom-3 left-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/75 text-white shadow-md ring-2 ring-white/90"
    >
      <Play className="ml-0.5 h-5 w-5 fill-white" aria-hidden />
    </button>
  )
}
