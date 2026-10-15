'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveFeedCardVideo } from '@/lib/videoFeed/feedCardVideo'
import {
  applyYoutubeMuteIntent,
  mediaCommand,
  nextPreferredMutedFromUiToggle,
  nextUserPausedFromTap,
  userPausedAfterDeactivate,
  youtubeCommandPayload,
  youtubePlayerFunc,
} from '@/lib/videoFeed/playbackIntent'
import { youtubeEmbedParentOrigin, youtubeEmbedSrc } from '@/lib/videoFeed/youtubeEmbedOrigin'
import { pauseOtherPageVideos } from '@/lib/videoPlayback'

const FEED_AUDIO_KEY = 'nahaber-feed-v2-preferred-unmuted'
const YT_EMBED_ORIGIN = 'https://www.youtube-nocookie.com'

function readPreferredMuted(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.sessionStorage.getItem(FEED_AUDIO_KEY) !== '1'
  } catch {
    return true
  }
}

function persistPreferredMuted(muted: boolean) {
  try {
    if (muted) window.sessionStorage.removeItem(FEED_AUDIO_KEY)
    else window.sessionStorage.setItem(FEED_AUDIO_KEY, '1')
  } catch {
    /* ignore */
  }
}

interface SmartFeedCardVideoProps {
  url: string
  isActive: boolean
  poster?: string | null
  onUnusable?: () => void
  /**
   * FEED-VIDEO-1 / FEED-UX-2: 'auto' fills the screen with an upright video and shows a
   * landscape one whole; 'contain' / 'cover' force one. 'reels' (FEED-UX-2d): the video at
   * its original size — full screen width, its own height, never cropped — an upright video
   * sits right above the bottom bar (Instagram Reels), a landscape one in the middle.
   */
  fit?: 'auto' | 'contain' | 'cover' | 'reels'
}

export function SmartFeedCardVideo({
  url,
  isActive,
  poster,
  onUnusable,
  fit = 'auto',
}: SmartFeedCardVideoProps) {
  const resolved = resolveFeedCardVideo(url)
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const userPausedRef = useRef(false)
  const ytPlayerStateRef = useRef<number | null>(null)
  const preferredMutedRef = useRef(true)
  const [userPaused, setUserPaused] = useState(false)
  const [paused, setPaused] = useState(false)
  const [preferredMuted, setPreferredMuted] = useState(true)
  const [playerMuted, setPlayerMuted] = useState<boolean | null>(null)
  const [upright, setUpright] = useState<boolean | null>(null)
  const [progress, setProgress] = useState(0)
  const objectFit = fit === 'auto' ? (upright === false ? 'contain' : 'cover') : fit
  const reelsUpright = fit === 'reels' && upright !== false

  const effectiveMuted = playerMuted ?? preferredMuted

  const postToYT = useCallback((payload: object) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(payload), '*')
  }, [])

  const sendYTCmd = useCallback(
    (func: string, args: unknown[] = []) => {
      postToYT(youtubeCommandPayload(func, args))
    },
    [postToYT]
  )

  const setUserPausedIntent = useCallback((next: boolean) => {
    userPausedRef.current = next
    setUserPaused(next)
  }, [])

  const applyPlayback = useCallback(() => {
    const command = mediaCommand({
      isActive,
      userPaused: userPausedRef.current,
      visible: isActive,
    })
    if (resolved?.kind === 'native') {
      const el = videoRef.current
      if (!el) return
      el.muted = preferredMutedRef.current
      setPlayerMuted(el.muted)
      if (command === 'play') {
        pauseOtherPageVideos(el)
        void el.play().catch(() => {
          el.muted = true
          setPlayerMuted(true)
          void el.play().catch(() => {
            setPaused(true)
            onUnusable?.()
          })
        })
        setPaused(false)
      } else {
        el.pause()
        setPaused(true)
      }
      return
    }
    if (resolved?.kind === 'youtube' || resolved?.kind === 'vimeo' || resolved?.kind === 'dailymotion') {
      postToYT({ event: 'listening', id: null, channel: 'widget' })
      sendYTCmd(youtubePlayerFunc(command))
      applyYoutubeMuteIntent(sendYTCmd, preferredMutedRef.current)
      setPaused(command === 'pause')
    }
  }, [isActive, onUnusable, postToYT, resolved?.kind, sendYTCmd, userPaused])

  useEffect(() => {
    preferredMutedRef.current = preferredMuted
  }, [preferredMuted])

  useEffect(() => {
    if (!resolved) {
      onUnusable?.()
    }
  }, [onUnusable, resolved])

  useEffect(() => {
    setPreferredMuted(readPreferredMuted())
    preferredMutedRef.current = readPreferredMuted()
  }, [])

  useEffect(() => {
    setUserPausedIntent(userPausedAfterDeactivate())
    ytPlayerStateRef.current = null
  }, [url, setUserPausedIntent])

  useEffect(() => {
    applyPlayback()
  }, [applyPlayback, isActive, userPaused])

  useEffect(() => {
    if (!isActive || !userPaused || resolved?.kind !== 'youtube') return
    const hold = window.setInterval(() => {
      sendYTCmd('pauseVideo')
    }, 400)
    return () => window.clearInterval(hold)
  }, [isActive, userPaused, resolved?.kind, sendYTCmd])

  useEffect(() => {
    if (resolved?.kind !== 'youtube') return
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (event.origin !== YT_EMBED_ORIGIN && event.origin !== 'https://www.youtube.com') return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (!data) return
        if (data.event === 'onReady') applyPlayback()
        if (data.event === 'onError') onUnusable?.()
        if (data.event === 'infoDelivery' && data.info) {
          if (typeof data.info.muted === 'boolean') setPlayerMuted(data.info.muted)
          const pState = data.info.playerState
          if (typeof pState === 'number') ytPlayerStateRef.current = pState
          if (userPausedRef.current && (pState === 1 || pState === 3)) {
            sendYTCmd('pauseVideo')
            setPaused(true)
          }
        }
        if (data.event === 'onStateChange') {
          const state = typeof data.info === 'number' ? data.info : data.info?.playerState
          if (typeof state === 'number') ytPlayerStateRef.current = state
          if (userPausedRef.current && (state === 1 || state === 3)) {
            sendYTCmd('pauseVideo')
            setPaused(true)
            return
          }
          if (!userPausedRef.current && isActive && (state === 1 || state === 3)) {
            setPaused(false)
          }
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [applyPlayback, isActive, onUnusable, resolved?.kind, sendYTCmd])

  const togglePause = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      const el = videoRef.current
      const playerPlaying = el
        ? !el.paused
        : ytPlayerStateRef.current === 1 || ytPlayerStateRef.current === 3
      const next = nextUserPausedFromTap({
        currentlyUserPaused: userPausedRef.current,
        playerPlaying,
      })
      setUserPausedIntent(next)
      applyPlayback()
    },
    [applyPlayback, setUserPausedIntent]
  )

  const toggleSound = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      const nextMuted = nextPreferredMutedFromUiToggle(effectiveMuted)
      preferredMutedRef.current = nextMuted
      setPreferredMuted(nextMuted)
      persistPreferredMuted(nextMuted)
      const el = videoRef.current
      if (el) {
        el.muted = nextMuted
        setPlayerMuted(el.muted)
        if (!nextMuted) {
          void el.play().catch(() => {
            el.muted = true
            setPlayerMuted(true)
          })
        }
      } else {
        applyYoutubeMuteIntent(sendYTCmd, nextMuted)
      }
    },
    [effectiveMuted, sendYTCmd]
  )

  if (!resolved) return null

  const embedSrc =
    resolved.kind === 'youtube'
      ? youtubeEmbedSrc(resolved.videoId, youtubeEmbedParentOrigin())
      : resolved.kind === 'vimeo'
        ? `https://player.vimeo.com/video/${resolved.videoId}?autoplay=1&muted=1&loop=1&playsinline=1`
        : resolved.kind === 'dailymotion'
          ? `https://www.dailymotion.com/embed/video/${resolved.videoId}?autoplay=1&mute=1&controls=0`
          : null

  return (
    <div className="absolute inset-0" data-testid="smart-feed-card-video" data-video-kind={resolved.kind}>
      {resolved.kind === 'native' ? (
        <video
          ref={videoRef}
          src={resolved.url}
          poster={poster ?? undefined}
          className={
            fit === 'reels'
              ? cn('absolute inset-x-0 h-auto max-h-full w-full', !reelsUpright && 'top-1/2 -translate-y-1/2')
              : objectFit === 'cover'
                ? 'h-full w-full object-cover'
                : 'h-full w-full object-contain'
          }
          style={fit === 'reels' && reelsUpright ? { bottom: 'var(--feed-v2-bottom-clearance, 4.5rem)' } : undefined}
          data-video-fit={objectFit}
          onLoadedMetadata={(event) => {
            const v = event.currentTarget
            if (v.videoWidth && v.videoHeight) setUpright(v.videoHeight >= v.videoWidth * 1.1)
          }}
          onTimeUpdate={(event) => {
            const v = event.currentTarget
            if (v.duration > 0) setProgress(Math.min(1, v.currentTime / v.duration))
          }}
          playsInline
          muted
          loop
          autoPlay={isActive && !userPaused}
          onError={() => onUnusable?.()}
          onPlaying={() => {
            if (userPausedRef.current) videoRef.current?.pause()
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={togglePause}
        />
      ) : (
        <>
          <iframe
            ref={iframeRef}
            src={embedSrc ?? undefined}
            title="Video"
            className="absolute inset-0 h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture"
            onError={() => onUnusable?.()}
          />
          <button
            type="button"
            className="absolute inset-0 z-[1]"
            aria-label={paused ? 'Oynat' : 'Duraklat'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={togglePause}
          />
        </>
      )}

      {paused && isActive ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45">
            <Play className="h-7 w-7 fill-white text-white" />
          </div>
        </div>
      ) : null}

      {/* Sound: round button top right, under the category bar (Reels). */}
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={toggleSound}
        aria-label={effectiveMuted ? 'Sesi aç' : 'Sesi kapat'}
        data-testid="smart-feed-video-sound"
        className="absolute right-3 z-[3] flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        style={{ top: fit === 'reels' ? 'calc(var(--feed-overlay-sat, env(safe-area-inset-top, 0px)) + 7.25rem)' : '0.5rem' }}
      >
        {effectiveMuted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
        <span className="sr-only">{effectiveMuted ? 'Sessiz' : 'Sesli'}</span>
      </button>
      {resolved.kind === 'native' && isActive ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-[3] h-[2px] bg-white/25"
          style={{ bottom: fit === 'reels' ? 'var(--feed-v2-bottom-clearance, 4.5rem)' : 0 }}
          aria-hidden
          data-testid="smart-feed-video-progress"
        >
          <div className="h-full bg-white" style={{ width: `${Math.round(progress * 1000) / 10}%` }} />
        </div>
      ) : null}
    </div>
  )
}
