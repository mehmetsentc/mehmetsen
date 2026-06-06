'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Loader2, Play } from 'lucide-react'
import { getPrimaryVideo } from '@/lib/postUtils'
import { postService } from '@/services/postService'
import { VideoActions } from './VideoActions'
import { VideoOverlay } from './VideoOverlay'
import { VideoCommentSheet } from './VideoCommentSheet'
import type { VideoFeedItem as VideoFeedItemType } from '@/hooks/useVideoFeed'

interface VideoFeedItemProps {
  video: VideoFeedItemType
  isActive: boolean
  index: number
  setItemRef: (index: number, el: HTMLDivElement | null) => void
  onUpdate: (postId: string, patch: Partial<VideoFeedItemType>) => void
}

export function VideoFeedItem({
  video,
  isActive,
  index,
  setItemRef,
  onUpdate,
}: VideoFeedItemProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const viewedRef = useRef(false)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [commentsOpen, setCommentsOpen] = useState(false)

  const media = getPrimaryVideo(video)

  const refCallback = useCallback(
    (el: HTMLDivElement | null) => setItemRef(index, el),
    [index, setItemRef]
  )

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (isActive) {
      el.currentTime = 0
      el.play().catch(() => setPaused(true))
      setPaused(false)

      if (!viewedRef.current) {
        viewedRef.current = true
        postService.incrementViews(video.id).catch(() => {})
      }
    } else {
      el.pause()
      el.currentTime = 0
      setPaused(false)
    }
  }, [isActive, video.id])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) {
      el.play()
      setPaused(false)
    } else {
      el.pause()
      setPaused(true)
    }
  }

  const toggleMute = () => {
    const el = videoRef.current
    if (!el) return
    el.muted = !el.muted
    setMuted(el.muted)
  }

  if (!media?.url) {
    return (
      <div
        ref={refCallback}
        data-index={index}
        className="relative flex h-full w-full snap-start snap-always items-center justify-center bg-black"
      >
        <p className="text-sm text-white/60">Video bulunamadı</p>
      </div>
    )
  }

  return (
    <div
      ref={refCallback}
      data-index={index}
      className="relative h-full w-full shrink-0 snap-start snap-always bg-black"
    >
      <video
        ref={videoRef}
        src={media.url}
        poster={media.thumbnailUrl ?? undefined}
        className="absolute inset-0 h-full w-full object-cover"
        loop
        playsInline
        muted={muted}
        preload={isActive ? 'auto' : 'metadata'}
        onLoadedData={() => setLoading(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onClick={togglePlay}
      />

      {loading && isActive && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-white/80" />
        </div>
      )}

      {paused && isActive && !loading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Play className="h-8 w-8 fill-white text-white" />
          </div>
        </div>
      )}

      <VideoOverlay video={video} muted={muted} onToggleMute={toggleMute} />

      <VideoActions
        video={video}
        onCommentClick={() => setCommentsOpen(true)}
        onLikeChange={(liked, count) => onUpdate(video.id, { isLiked: liked, likesCount: count })}
        onSaveChange={(saved, count) => onUpdate(video.id, { isSaved: saved, savesCount: count })}
      />

      <VideoCommentSheet
        postId={video.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        commentsCount={video.commentsCount}
        onCommentAdded={() =>
          onUpdate(video.id, { commentsCount: video.commentsCount + 1 })
        }
      />
    </div>
  )
}
