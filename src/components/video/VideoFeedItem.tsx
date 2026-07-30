'use client'

import { memo, useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Heart, Loader2, Play } from 'lucide-react'
import { getPrimaryVideo, isYouTubeUrl, parseYouTubeVideoId } from '@/lib/postUtils'
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
// YouTube iframe postMessage target — must match embed host (youtube-nocookie.com).
const YT_EMBED_ORIGIN = 'https://www.youtube-nocookie.com'

interface VideoFeedItemProps {
  video: VideoFeedItemType
  isActive: boolean
  /** True for the item immediately after the active one — triggers preload */
  isNext?: boolean
  index: number
  setItemRef: (index: number, el: HTMLDivElement | null) => void
  onUpdate: (postId: string, patch: Partial<VideoFeedItemType>) => void
  /** Virtual window — render only a scroll-snap anchor, no video content */
  virtualized?: boolean
}

function VideoFeedItemInner({
  video,
  isActive,
  isNext = false,
  index,
  setItemRef,
  onUpdate,
  virtualized = false,
}: VideoFeedItemProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
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
  const [ytBlocked, setYtBlocked] = useState(false)   // embedding engeli: 101/150
  const [ytApiConnected, setYtApiConnected] = useState(false) // YouTube JS API bağlandı mı
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [heartBurst, setHeartBurst] = useState<{ x: number; y: number; key: number } | null>(null)
  const [progress, setProgress] = useState(0) // 0–100

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

  // YouTube: embed, watch, shorts, youtu.be — iframe gerekir (<video> YouTube oynatamaz).
  const youtubeVideoId = useMemo(
    () => (stableSrc && isYouTubeUrl(stableSrc) ? parseYouTubeVideoId(stableSrc) : null),
    [stableSrc]
  )
  const isYouTube = Boolean(youtubeVideoId)

  // Audio-only mode: AI-generated news audio without video file
  const audioUrl = (video as VideoFeedItemType & { audioUrl?: string }).audioUrl
  const isAudioMode = !stableSrc && Boolean(audioUrl)
  const audioRef = useRef<HTMLAudioElement>(null)

  const wasLoadedBefore = isVideoLoaded(video.id) || Boolean(stableSrc && hasMediaBeenFetched(stableSrc))

  const preload = useMemo((): 'none' | 'metadata' | 'auto' => {
    if (wasLoadedBefore || (stableSrc && hasMediaBeenFetched(stableSrc))) {
      return 'auto'
    }
    if (isActive) return videoPreloadForTier(tier, true)
    // Sıradaki video: yavaş bağlantıda metadata, diğerlerinde tam buffer
    if (isNext) return tier === 'low' ? 'metadata' : 'auto'
    return 'none'
  }, [wasLoadedBefore, stableSrc, tier, isActive, isNext, hasMediaBeenFetched])

  const refCallback = useCallback(
    (el: HTMLDivElement | null) => setItemRef(index, el),
    [index, setItemRef]
  )

  const postToYT = useCallback((payload: object) => {
    // '*' kullanılıyor: YouTube iframe yüklenirken origin değişebilir (nocookie→youtube.com).
    // Hedefli postMessage sessizce düşer → player komutlarımızı almaz → event göndermez.
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(payload), '*')
  }, [])

  const sendYTCmd = useCallback(
    (func: string, args: string | unknown[] = '') => {
      postToYT({ event: 'command', func, args })
    },
    [postToYT]
  )

  // Required before YouTube emits onReady/onStateChange back to the parent page.
  const sendYTListening = useCallback(() => {
    postToYT({ event: 'listening', id: null, channel: 'widget' })
  }, [postToYT])

  // ── All hooks MUST be declared before any conditional return (Rules of Hooks) ──

  const handleMediaReady = useCallback(() => {
    if (stableSrc) {
      markMediaFetched(stableSrc)
      markVideoLoaded(video.id, stableSrc)
    }
    setLoading(false)
  }, [stableSrc, markMediaFetched, markVideoLoaded, video.id])

  useEffect(() => {
    if (virtualized) return
    if (wasLoadedBefore) setLoading(false)
  }, [wasLoadedBefore, virtualized])

  useEffect(() => {
    if (virtualized) return
    const el = videoRef.current
    if (!el) return
    el.muted = muted
  }, [muted, isActive, video.id, virtualized])

  useEffect(() => {
    if (virtualized) return
    const el = videoRef.current
    if (!el) return

    if (isActive) {
      if (!wasLoadedBefore) el.currentTime = 0
      el.muted = muted
      // Sesli autoplay dene; tarayıcı engellerse sadece elementi sessizleştir.
      // setMuted ÇAĞIRILMAZ — kullanıcı tercihi korunur, sonraki gesture'da sesli oynar.
      el.play().catch(() => {
        el.muted = true
        el.play().catch(() => setPaused(true))
      })
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
  }, [isActive, video.id, muted, onUpdate, video.viewsCount, wasLoadedBefore, virtualized])

  useEffect(() => {
    if (virtualized || !isActive) return
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
  }, [isActive, video.id, user?.uid, virtualized])

  // Progress bar — timeupdate; reset to 0 when inactive or virtualized
  useEffect(() => {
    if (virtualized || !isActive) {
      setProgress(0)
      return
    }
    const el = videoRef.current
    if (!el) return
    const onTime = () => {
      if (el.duration > 0) {
        const pct = (el.currentTime / el.duration) * 100
        requestAnimationFrame(() => setProgress(pct))
      }
    }
    el.addEventListener('timeupdate', onTime)
    return () => el.removeEventListener('timeupdate', onTime)
  }, [isActive, virtualized])

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
        triggerDoubleTapLike(x, y)
        return
      }

      tapTimerRef.current = setTimeout(() => {
        if (tapCountRef.current === 1) {
          togglePlay()
        }
        tapCountRef.current = 0
      }, DOUBLE_TAP_MS)
    },
    [togglePlay, triggerDoubleTapLike]
  )

  // ── Audio-only card ses senkronizasyonu ───────────────────────────────────
  useEffect(() => {
    if (virtualized) return
    const el = audioRef.current
    if (!el || !isAudioMode) return
    el.muted = muted
    if (isActive && !paused) {
      el.play().catch(() => setPaused(true))
    } else {
      el.pause()
    }
  }, [isActive, paused, muted, isAudioMode, virtualized])

  // ── YouTube postMessage — oynatma/durdurma + ses sync + embedding engeli ────
  // Sabit key ile iframe yeniden yüklenmediği için play/pause tamamen postMessage ile yönetilir.
  // isActive=true  → playVideo + mute/unMute
  // isActive=false → pauseVideo
  // onReady        → playVideo (player hazır olduğunda hemen başlat)
  // Hata kodları: 101/150 = embedding engeli, 100 = video kaldırıldı.
  useEffect(() => {
    if (virtualized || !isYouTube) return

    const muteCmd = muted ? 'mute' : 'unMute'

    const playActive = () => {
      sendYTListening()
      if (isActive) {
        sendYTCmd('playVideo')
        sendYTCmd(muteCmd)
      } else {
        sendYTCmd('pauseVideo')
      }
    }

    playActive()

    const handleMessage = (e: MessageEvent) => {
      // Sadece BU iframe'den gelen mesajlar işlenir.
      // Sayfada birden fazla YouTube iframe olduğunda (virtual window) tüm handleMessage
      // callback'leri tüm mesajları alır → yanlış iframe'in onStateChange'i aktif
      // videonun pause/play state'ini bozar (shaking + play butonu takılması).
      if (e.source !== iframeRef.current?.contentWindow) return
      if (e.origin !== YT_EMBED_ORIGIN && e.origin !== 'https://www.youtube.com') return
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (!data) return

        // Herhangi bir YouTube event'i → API bağlandı
        if (data?.event) setYtApiConnected(true)

        // Player hazır olduğunda hemen oynat (veya duraklat)
        if (data?.event === 'onReady') {
          playActive()
        }

        // Sync UI pause state with actual player state (tap overlay relies on this).
        if (data?.event === 'onStateChange') {
          const state = typeof data.info === 'number' ? data.info : data.info?.playerState
          if (state === 1) setPaused(false)
          else if (state === 2 || state === 0) setPaused(true)
          if (isActive) sendYTCmd(muteCmd)
        }

        // infoDelivery: video gerçekte oynuyor veya buffer'a aldı → paused=false yap.
        // Neden '*' ile postMessage? YouTube iframe yüklenince origin değişebiliyor.
        // Hedefli postMessage (YT_EMBED_ORIGIN) sessizce düşüyor → 'listening' ulaşmıyor
        // → YouTube event göndermez → onStateChange hiç gelmez → siyah ekran.
        // '*' ile gönderince listening ulaşıyor ve bu infoDelivery'ler dönüyor.
        if (data?.event === 'infoDelivery' && isActive) {
          const info = data.info
          const pState = info?.playerState
          // 1=oynuyor, 3=buffer → her iki durumda da oynatma başladı say
          if (pState === 1 || pState === 3) {
            setPaused(false)
          }
          if (typeof info?.currentTime === 'number' && info.currentTime > 0) {
            setPaused(false)
            setLoading(false)
            // Mute senkronizasyonu: YouTube'dan muted durumu gelirse React ile eşitle
            if (typeof info.muted === 'boolean') {
              if (info.muted && !muted) sendYTCmd('unMute')
              else if (!info.muted && muted) sendYTCmd('mute')
            }
          }
        }

        // Embedding engeli tespiti:
        // 101/150 = video sahibi embedding'i kapattı, 100 = video kaldırıldı
        if (data?.event === 'onError') {
          const code = typeof data.info === 'number' ? data.info : data.info?.errorCode
          if (code === 100 || code === 101 || code === 150) {
            setYtBlocked(true)
            setLoading(false)
          }
        }

        // playerState: -1/5=hazır, 0=bitti, 1=oynuyor, 2=duraklatıldı, 3=yüklüyor
      } catch { /* ignore */ }
    }

    window.addEventListener('message', handleMessage)
    // Yeniden deneme: player henüz hazır değilse gecikmiş komutlar
    const t1 = setTimeout(playActive, 600)
    const t2 = setTimeout(playActive, 1500)
    const t3 = setTimeout(playActive, 3000)

    return () => {
      window.removeEventListener('message', handleMessage)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [muted, isYouTube, isActive, virtualized, sendYTCmd, sendYTListening])

  // ── YouTube API timeout kaldırıldı ─────────────────────────────────────────
  // Eski mantık: iOS/WebKit'te postMessage gelmezse 7s sonra ytBlocked=true yapıyordu.
  // Sorun: gerçekte oynayan videolar "engelli" sanılıp "YouTube'da İzle" gösteriliyordu.
  // Yeni mantık: ytBlocked yalnızca gerçek hata kodlarında (100/101/150) set edilir.
  // ytApiConnected state'i artık kullanılmıyor ama kaldırılmadı (ref için güvenli).

  // Video değiştiğinde YouTube player state sıfırla
  useEffect(() => {
    setYtApiConnected(false)
    if (isYouTube) {
      setPaused(true)
      setYtBlocked(false)
      setLoading(true)
    }
  }, [video.id, isYouTube])

  // Virtual window: render only scroll-snap anchor outside ± render window.
  // IMPORTANT: this return must come AFTER ALL hooks above — Rules of Hooks.
  if (virtualized) {
    return (
      <div
        ref={refCallback}
        data-index={index}
        className="reels-slide bg-black"
        aria-hidden
      />
    )
  }

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

    // No video, no audio — static thumbnail card (AI script-ready reels without TTS audio)
    const staticCover = video.coverImageUrl ?? video.mediaItems?.[0]?.thumbnailUrl ?? null
    return (
      <div ref={refCallback} data-index={index} className="reels-slide">
        <div className="reels-video-card relative overflow-hidden bg-black">
          {staticCover && (
            <img
              src={staticCover}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-80"
              loading="lazy"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
          <div className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
            Haber Videosu
          </div>
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

  // ── YouTube iframe modu ────────────────────────────────────────────────────
  // <video> HTML elementi YouTube URL'lerini oynatamaz — iframe gerekir.
  // Browser autoplay politikası: sesli autoplay engellenir → mute=1 başlar.
  // origin parametresi: YouTube JS API cross-origin postMessage güvenliği için zorunlu.
  // ytBlocked=true: video sahibi embedding'i kapatmış (101/150) → fallback UI göster.
  if (isYouTube && youtubeVideoId) {
    const videoId = youtubeVideoId
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`

    // youtube-nocookie.com: gizlilik modu + iOS WebKit'te postMessage daha güvenilir
    // autoplay=1 + mute=1: browser autoplay politikasını bypass eder (sesli → postMessage ile aç)
    // Tek sabit src — key değişmez, iframe yeniden yüklenmez.
    // Oynatma/durdurma postMessage (playVideo/pauseVideo) ile yönetilir.
    // origin=https://nahaber.com hardcoded: Capacitor WebView'da window.location.origin
    // "capacitor://localhost" döner, YouTube bunu bot olarak algılar → oturum açma overlay'i.
    const baseEmbed = `https://www.youtube-nocookie.com/embed/${videoId}`
    const embedSrc = `${baseEmbed}?autoplay=1&mute=1&loop=1&playlist=${videoId}&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&controls=0&origin=https://nahaber.com`

    const coverSrc = video.coverImageUrl ?? video.mediaItems?.[0]?.thumbnailUrl
      ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

    return (
      <div ref={refCallback} data-index={index} className="reels-slide">
        <div className="reels-video-card relative overflow-hidden bg-black">

          {/* ── Embedding engeli fallback ── */}
          {ytBlocked ? (
            <>
              {/* Thumbnail arka plan */}
              {coverSrc && (
                <img
                  src={coverSrc}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-60"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/70" />

              {/* "YouTube'da İzle" butonu — ortada */}
              <a
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3"
              >
                {/* YouTube logo */}
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg">
                  <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white">
                    <path d="M10 15l5.19-3L10 9v6z"/>
                    <path d="M21.56 7.17a2.76 2.76 0 0 0-1.94-1.95C17.88 4.8 12 4.8 12 4.8s-5.88 0-7.62.42a2.76 2.76 0 0 0-1.94 1.95C2 8.93 2 12 2 12s0 3.07.44 4.83a2.76 2.76 0 0 0 1.94 1.95C6.12 19.2 12 19.2 12 19.2s5.88 0 7.62-.42a2.76 2.76 0 0 0 1.94-1.95C22 15.07 22 12 22 12s0-3.07-.44-4.83z"/>
                  </svg>
                </div>
                <span className="rounded-full bg-white/90 px-4 py-1.5 text-sm font-bold text-gray-900 shadow">
                  YouTube&apos;da İzle
                </span>
              </a>

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
            </>
          ) : (
            <>
              {/* Spinner — iframe yüklenene kadar */}
              {loading && isActive && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/30">
                  <Loader2 className="h-10 w-10 animate-spin text-white/80" />
                </div>
              )}

              <iframe
                ref={iframeRef}
                key={`yt-${video.id}`}
                src={embedSrc}
                title={video.title}
                className="absolute inset-0 h-full w-full border-0"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture; web-share"
                allowFullScreen
                onLoad={() => {
                  sendYTListening()
                  if (isActive) {
                    sendYTCmd('playVideo')
                    sendYTCmd(muted ? 'mute' : 'unMute')
                    // autoplay=1&mute=1 iframe başlayınca oynar — overlay'i hemen kaldır
                    setPaused(false)
                  }
                  setLoading(false)
                }}
              />

              {/* YouTube üst başlık/kanal overlay'ini gizle — siyah bant */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-16 bg-black" />

              {/* Tap interceptor — iframe controls hidden; play/pause via postMessage */}
              <div
                className="absolute inset-0 z-[1]"
                onClick={() => {
                  sendYTListening()
                  if (paused) {
                    sendYTCmd('playVideo')
                    sendYTCmd(muted ? 'mute' : 'unMute')
                    setPaused(false)
                  } else {
                    sendYTCmd('pauseVideo')
                    setPaused(true)
                  }
                }}
              />

              {/* Duraklama ikonu */}
              {paused && isActive && (
                <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                    <Play className="h-8 w-8 fill-white text-white" />
                  </div>
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
            </>
          )}
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
          disablePictureInPicture
          // iOS native kontrol overlay'lerini gizle (CC, airplay, volume badge)
          controlsList="nodownload nofullscreen noremoteplayback"
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

        {/* ── Progress bar (TikTok stili, en alt) ── */}
        {isActive && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-0.5 bg-white/20">
            <div
              className="h-full bg-white transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export const VideoFeedItem = memo(VideoFeedItemInner)
