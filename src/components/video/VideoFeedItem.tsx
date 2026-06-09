'use client'

import { memo, useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Loader2, Play, Volume2, VolumeX } from 'lucide-react'
import { getPrimaryVideo } from '@/lib/postUtils'
import { markReelSeen } from '@/lib/reelsSeen'
import { postService } from '@/services/postService'
import { useAuth } from '@/hooks/useAuth'
import { useReelsAudio } from '@/store/reelsAudioContext'
import { useNetworkTier, videoPreloadForTier } from '@/store/networkContext'
import { useAppState } from '@/store/appStateContext'
import { VideoActions } from './VideoActions'
import { VideoOverlay } from './VideoOverlay'
import { VideoCommentSheet } from './VideoCommentSheet'
import type { VideoFeedItem as VideoFeedItemType } from '@/hooks/useVideoFeed'

const DOUBLE_TAP_MS = 280
const SEEN_THRESHOLD_MS = 2_500

interface VideoFeedItemProps {
  video: VideoFeedItemType
  isActive: boolean
  index: number
  setItemRef: (index: number, el: HTMLDivElement | null) => void
  onUpdate: (postId: string, patch: Partial<VideoFeedItemType>) => void
}

function VideoFeedItemInner({
  video,
  isActive,
  index,
  setItemRef,
  onUpdate,
}: VideoFeedItemProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const viewedRef = useRef(false)
  const seenMarkedRef = useRef(false)
  const { user } = useAuth()
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { muted, toggleMuted } = useReelsAudio()
  const tier = useNetworkTier()
  const {
    isVideoLoaded,
    markVideoLoaded,
    getVideoUrl,
    hasMediaBeenFetched,
    markMediaFetched,
  } = useAppState()
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [showUnmuteHint, setShowUnmuteHint] = useState(false)

  const media = getPrimaryVideo(video)
  const stableSrc = useMemo(() => {
    if (!media?.url) return undefined
    return getVideoUrl(video.id) ?? media.url
  }, [getVideoUrl, video.id, media?.url])

  const wasLoadedBefore = isVideoLoaded(video.id) || Boolean(stableSrc && hasMediaBeenFetched(stableSrc))

  const preload = useMemo((): 'none' | 'metadata' | 'auto' => {
    if (wasLoadedBefore || (stableSrc && hasMediaBeenFetched(stableSrc))) {
      return 'auto'
    }
    return videoPreloadForTier(tier, isActive)
  }, [wasLoadedBefore, stableSrc, tier, isActive, hasMediaBeenFetched])

  const refCallback = useCallback(
    (el: HTMLDivElement | null) => setItemRef(index, el),
    [index, setItemRef]
  )

  const handleMediaReady = useCallback(() => {
    if (stableSrc) {
      markMediaFetched(stableSrc)
      markVideoLoaded(video.id, stableSrc)
    }
    setLoading(false)
  }, [stableSrc, markMediaFetched, markVideoLoaded, video.id])

  useEffect(() => {
    if (wasLoadedBefore) {
      setLoading(false)
    }
  }, [wasLoadedBefore])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.muted = muted
  }, [muted, isActive, video.id])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (isActive) {
      if (!wasLoadedBefore) {
        el.currentTime = 0
      }
      el.muted = muted
      el.play().catch(() => setPaused(true))
      setPaused(false)

      if (!viewedRef.current) {
        viewedRef.current = true
        onUpdate(video.id, { viewsCount: video.viewsCount + 1 })
        postService.incrementViews(video.id).catch(() => {})
      }
    } else {
      el.pause()
      if (!wasLoadedBefore) {
        el.currentTime = 0
      }
      setPaused(false)
      seenMarkedRef.current = false
    }
  }, [isActive, video.id, muted, onUpdate, video.viewsCount, wasLoadedBefore])

  useEffect(() => {
    if (!isActive) return

    const el = videoRef.current
    if (!el) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const handlePlaying = () => {
      if (seenMarkedRef.current || timer) return
      timer = setTimeout(() => {
        if (seenMarkedRef.current) return
        seenMarkedRef.current = true
        markReelSeen(video.id, user?.uid)
      }, SEEN_THRESHOLD_MS)
    }

    el.addEventListener('playing', handlePlaying)
    if (!el.paused && !el.ended) {
      handlePlaying()
    }

    return () => {
      el.removeEventListener('playing', handlePlaying)
      if (timer) clearTimeout(timer)
    }
  }, [isActive, video.id, user?.uid])

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    }
  }, [])

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) {
      void el.play()
      setPaused(false)
    } else {
      el.pause()
      setPaused(true)
    }
  }, [])

  const handleUnmute = useCallback(() => {
    toggleMuted()
    setShowUnmuteHint(true)
    window.setTimeout(() => setShowUnmuteHint(false), 900)
  }, [toggleMuted])

  const handleVideoPointerUp = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      handleUnmute()
      return
    }

    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      togglePlay()
    }, DOUBLE_TAP_MS)
  }, [handleUnmute, togglePlay])

  if (!stableSrc) {
    return (
      <div ref={refCallback} data-index={index} className="reels-slide">
        <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-muted))]" />
      </div>
    )
  }

  return (
    <div ref={refCallback} data-index={index} className="reels-slide">
      <div className="reels-video-card">
        <video
          ref={videoRef}
          src={stableSrc}
          poster={media?.thumbnailUrl ?? undefined}
          className="reels-video"
          loop
          playsInline
          muted={muted}
          preload={preload}
          onLoadedData={handleMediaReady}
          onWaiting={() => {
            if (!wasLoadedBefore) setLoading(true)
          }}
          onPlaying={() => setLoading(false)}
          onClick={handleVideoPointerUp}
        />

        {loading && isActive && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/30">
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

        {showUnmuteHint && isActive && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
              {muted ? (
                <VolumeX className="h-8 w-8 text-white" />
              ) : (
                <Volume2 className="h-8 w-8 text-white" />
              )}
            </div>
          </div>
        )}

        <VideoActions
          video={video}
          onCommentClick={() => setCommentsOpen(true)}
          onLikeChange={(liked, count) =>
            onUpdate(video.id, { isLiked: liked, likesCount: count })
          }
          onSaveChange={(saved, count) =>
            onUpdate(video.id, { isSaved: saved, savesCount: count })
          }
          onShareChange={(count) => onUpdate(video.id, { sharesCount: count })}
        />

        <VideoOverlay video={video} />

        <VideoCommentSheet
          postId={video.id}
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          commentsCount={video.commentsCount}
          onCommentAdded={() => onUpdate(video.id, { commentsCount: video.commentsCount + 1 })}
        />
      </div>
    </div>
  )
}

export const VideoFeedItem = memo(VideoFeedItemInner)
