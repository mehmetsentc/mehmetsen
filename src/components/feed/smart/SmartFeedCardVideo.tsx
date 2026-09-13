'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Volume2, VolumeX } from 'lucide-react'
import { resolveFeedCardVideo } from '@/lib/videoFeed/feedCardVideo'
import {
  mediaCommand,
  nextPreferredMutedFromUiToggle,
  nextUserPaused,
  userPausedAfterDeactivate,
  youtubeMuteFunc,
  youtubePlayerFunc,
} from '@/lib/videoFeed/playbackIntent'
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
}

export function SmartFeedCardVideo({
  url,
  isActive,
  poster,
  onUnusable,
}: SmartFeedCardVideoProps) {
  const resolved = resolveFeedCardVideo(url)
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const userPausedRef = useRef(false)
  const preferredMutedRef = useRef(true)
  const [paused, setPaused] = useState(false)
  const [preferredMuted, setPreferredMuted] = useState(true)
  const [playerMuted, setPlayerMuted] = useState<boolean | null>(null)

  const effectiveMuted = playerMuted ?? preferredMuted

  const postToYT = useCallback((payload: object) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(payload), '*')
  }, [])

  const sendYTCmd = useCallback(
    (func: string) => {
      postToYT({ event: 'command', func, args: '' })
    },
    [postToYT]
  )

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
      sendYTCmd(youtubeMuteFunc(preferredMutedRef.current))
      setPaused(command === 'pause')
    }
  }, [isActive, onUnusable, postToYT, resolved?.kind, sendYTCmd])

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
    if (!isActive) {
      userPausedRef.current = userPausedAfterDeactivate()
      setPaused(false)
    }
    applyPlayback()
  }, [applyPlayback, isActive])

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
        if (data.event === 'infoDelivery' && data.info && typeof data.info.muted === 'boolean') {
          setPlayerMuted(data.info.muted)
        }
        if (data.event === 'onStateChange') {
          const state = typeof data.info === 'number' ? data.info : data.info?.playerState
          if (userPausedRef.current && state === 1) {
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
      userPausedRef.current = nextUserPaused(userPausedRef.current)
      applyPlayback()
    },
    [applyPlayback]
  )

  const toggleSound = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      const nextMuted = nextPreferredMutedFromUiToggle(effectiveMuted)
      preferredMutedRef.current = nextMuted
      setPreferredMuted(nextMuted)
      persistPreferredMuted(nextMuted)
      setPlayerMuted(nextMuted)
      const el = videoRef.current
      if (el) {
        el.muted = nextMuted
        if (!nextMuted) {
          void el.play().catch(() => {
            el.muted = true
            setPlayerMuted(true)
          })
        }
      }
      sendYTCmd(youtubeMuteFunc(nextMuted))
    },
    [effectiveMuted, sendYTCmd]
  )

  if (!resolved) return null

  const embedSrc =
    resolved.kind === 'youtube'
      ? `https://www.youtube-nocookie.com/embed/${resolved.videoId}?autoplay=1&mute=1&loop=1&playlist=${resolved.videoId}&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&controls=0&origin=https://nahaber.com`
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
          className="h-full w-full object-cover"
          playsInline
          muted
          loop
          autoPlay={isActive}
          onError={() => onUnusable?.()}
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

      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={toggleSound}
        aria-label={effectiveMuted ? 'Sesi aç' : 'Sesi kapat'}
        className="absolute bottom-3 left-3 z-[3] flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white"
      >
        {effectiveMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {effectiveMuted ? 'Sessiz' : 'Sesli'}
      </button>
    </div>
  )
}
