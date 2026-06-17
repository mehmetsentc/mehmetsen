'use client'

import { memo, useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Heart, Loader2, Play } from 'lucide-react'
import { getPrimaryVideo } from '@/lib/postUtils'
import { markReelSeen } from '@/lib/reelsSeen'
import { postService } from '@/services/postService'
import { useAuth } from '@/hooks/useAuth'
import { useReelsAudio } from '@/store/reelsAudioContext'
import { useNetworkTier, videoPreloadForTier } from '@/store/networkContext'
import { useAppState } from '@/store/appStateContext'
import { useLike } from '@/hooks/useLike'
import { VideoActions } from './VideoActions'
import { VideoOverlay } from './VideoOverlay'
import { VideoCommentSheet } from './VideoCommentSheet'
import type { VideoFeedItem as VideoFeedItemType } from '@/hooks/useVideoFeed'

const DOUBLE_TAP_MS = 300
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
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapCountRef = useRef(0)
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
  const [heartBurst, setHeartBurst] = useState<{ x: number; y: number; key: number } | null>(null)

  // Like hook for double-tap like
  const { liked, count: likesCount, toggle: toggleLike } = useLike({
    postId: video.id,
    initialLiked: video.isLiked,
    initialCount: video.likesCount,
  })

  const media = getPrimaryVideo(video)
  const stableSrc = useMemo(() => {
    if (!media?.url) return undefined
    return getVideoUrl(video.id) ?? media.url
  }, [getVideoUrl, video.id, media?.url])

  // YouTube embed tespiti — youtube-nocookie.com/embed veya youtube.com/embed
  const isYouTube = Boolean(stableSrc && /youtube[^/]*\/embed\//.test(stableSrc))

  // Audio-only mode: AI-generated news audio without video file
  const audioUrl = (video as VideoFeedItemType & { audioUrl?: string }).audioUrl
  const isAudioMode = !stableSrc && Boolean(audioUrl)
  const audioRef = useRef<HTMLAudioElement>(null)

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
    if (wasLoadedBefore) setLoading(false)
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
      if (!wasLoadedBefore) el.currentTime = 0
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
      if (!wasLoadedBefore) el.currentTime = 0
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
    if (!el.paused && !el.ended) handlePlaying()
    return () => {
      el.removeEventListener('playing', handlePlaying)
      if (timer) clearTimeout(timer)
    }
  }, [isActive, video.id, user?.uid])

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
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

  const triggerDoubleTapLike = useCallback(
    (x: number, y: number) => {
      if (!liked) {
        toggleLike()
        onUpdate(video.id, { isLiked: true, likesCount: likesCount + 1 })
      }
      setHeartBurst({ x, y, key: Date.now() })
      setTimeout(() => setHeartBurst(null), 900)
    },
    [liked, toggleLike, onUpdate, video.id, likesCount]
  )

  const handleVideoTap = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      const x = e.clientX
      const y = e.clientY
      tapCountRef.current += 1

      if (tapTimerRef.current) clearTimeout(tapTimerRef.current)

      if (tapCountRef.current >= 2) {
        tapCountRef.current = 0
        // Double tap → like
        triggerDoubleTapLike(x, y)
        return
      }

      tapTimerRef.current = setTimeout(() => {
        if (tapCountRef.current === 1) {
          // Single tap → play/pause
          togglePlay()
        }
        tapCountRef.current = 0
      }, DOUBLE_TAP_MS)
    },
    [togglePlay, triggerDoubleTapLike]
  )

  // ── Audio-only card (AI-generated TTS, no video file) ─────────────────────
  // Sync audio element play/pause/mute with isActive + paused + muted state
  useEffect(() => {
    const el = audioRef.current
    if (!el || !isAudioMode) return
    el.muted = muted
    if (isActive && !paused) {
      el.play().catch(() => setPaused(true))
    } else {
      el.pause()
    }
  }, [isActive, paused, muted, isAudioMode])

  if (!stableSrc) {
    if (isAudioMode) {
      const coverSrc = video.coverImageUrl ?? video.mediaItems?.[0]?.thumbnailUrl ?? null
      return (
        <div ref={refCallback} data-index={index} className="reels-slide">
          <div
            className="reels-video-card relative cursor-pointer select-none overflow-hidden bg-black"
            onClick={() => {
              if (paused) {
                audioRef.current?.play().catch(() => {})
                setPaused(false)
              } else {
                audioRef.current?.pause()
                setPaused(true)
              }
            }}
          >
            {/* Cover image as background */}
            {coverSrc && (
              <img
                src={coverSrc}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-80"
                loading="lazy"
              />
            )}

            {/* Dark gradient so text is readable */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />

            {/* Audio element — hidden, driven by effects */}
            <audio
              ref={audioRef}
              src={audioUrl}
              loop
              muted={muted}
              preload="auto"
              onLoadedData={() => setLoading(false)}
              onWaiting={() => setLoading(true)}
              onPlaying={() => setLoading(false)}
            />

            {/* Loading spinner */}
            {loading && isActive && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/30">
                <Loader2 className="h-10 w-10 animate-spin text-white/80" />
              </div>
            )}

            {/* Pause indicator */}
            {paused && isActive && !loading && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                  <Play className="h-8 w-8 fill-white text-white" />
                </div>
              </div>
            )}

            {/* "Audio News" badge */}
            <div className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
              Sesli Haber
            </div>

            {/* Heart burst on double-tap */}
            {heartBurst && (
              <div
                key={heartBurst.key}
                className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 animate-heart-burst"
                style={{ left: heartBurst.x, top: heartBurst.y }}
              >
                <Heart className="h-20 w-20 fill-[rgb(var(--color-brand))] text-[rgb(var(--color-brand))] drop-shadow-lg" />
              </div>
            )}

            <VideoActions
              video={{ ...video, isLiked: liked, likesCount }}
              onCommentClick={() => setCommentsOpen(true)}
              onLikeChange={(likedVal, count) =>
                onUpdate(video.id, { isLiked: likedVal, likesCount: count })
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

    // No video, no audio → spinner placeholder
    return (
      <div ref={refCallback} data-index={index} className="reels-slide">
        <div className="flex h-full w-full items-center justify-center bg-black">
          <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-muted))]" />
        </div>
      </div>
    )
  }

  // ── YouTube iframe modu ────────────────────────────────────────────────────
  // <video> HTML elementi YouTube URL'lerini oynatamaz — iframe gerekir.
  // Browser autoplay politikası: sesli autoplay engellenir → her zaman mute=1 başlar.
  // CSP frame-src'ye youtube-nocookie.com eklendi (next.config.ts).
  if (isYouTube && stableSrc) {
    const videoId = stableSrc.split('/embed/')[1]?.split('?')[0] ?? ''
    // Aktif slide → autoplay + sessiz (browser politikası). Ses YouTube kontrolünden açılır.
    // Aktif olmayan slide → sadece thumbnail göster (enablejsapi ile daha hafif).
    const embedSrc = isActive
      ? `${stableSrc}?autoplay=1&mute=1&loop=1&playlist=${videoId}&rel=0&modestbranding=1&playsinline=1`
      : `${stableSrc}?rel=0&modestbranding=1`
    return (
      <div ref={refCallback} data-index={index} className="reels-slide">
        <div className="reels-video-card relative overflow-hidden bg-black">
          {/* Spinner — iframe yüklenene kadar */}
          {loading && isActive && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/30">
              <Loader2 className="h-10 w-10 animate-spin text-white/80" />
            </div>
          )}
          <iframe
            key={isActive ? `yt-active-${video.id}` : `yt-inactive-${video.id}`}
            src={embedSrc}
            title={video.title}
            className="absolute inset-0 h-full w-full border-0"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; web-share"
            allowFullScreen
            onLoad={() => setLoading(false)}
          />
          {/* VideoActions sağ kenarda — iframe'in ortasına müdahale etmez */}
          <VideoActions
            video={{ ...video, isLiked: liked, likesCount }}
            onCommentClick={() => setCommentsOpen(true)}
            onLikeChange={(likedVal, count) =>
              onUpdate(video.id, { isLiked: likedVal, likesCount: count })
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

  return (
    <div ref={refCallback} data-index={index} className="reels-slide">
      <div className="reels-video-card">
        {/* Thumbnail background — shows instantly while video buffers, prevents white flash */}
        {media?.thumbnailUrl && (
          <img
            src={media.thumbnailUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        )}

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
          onWaiting={() => { if (!wasLoadedBefore) setLoading(true) }}
          onPlaying={() => setLoading(false)}
          onClick={handleVideoTap}
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

        {/* Muted indicator — tap anywhere on video to unmute */}
        {muted && isActive && !loading && !paused && (
          <button
            type="button"
            aria-label="Sesi aç"
            onClick={(e) => { e.stopPropagation(); toggleMuted() }}
            className="pointer-events-auto absolute bottom-24 left-4 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-opacity hover:bg-black/80"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
            Sesi aç
          </button>
        )}

        {/* Heart burst on double-tap */}
        {heartBurst && (
          <div
            key={heartBurst.key}
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 animate-heart-burst"
            style={{ left: heartBurst.x, top: heartBurst.y }}
          >
            <Heart className="h-20 w-20 fill-[rgb(var(--color-brand))] text-[rgb(var(--color-brand))] drop-shadow-lg" />
          </div>
        )}

        <VideoActions
          video={{ ...video, isLiked: liked, likesCount }}
          onCommentClick={() => setCommentsOpen(true)}
          onLikeChange={(likedVal, count) =>
            onUpdate(video.id, { isLiked: likedVal, likesCount: count })
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
