'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LIVING_VIDEO_DWELL_MS,
  isVisibleEnough,
  nextLivingVideoState,
  shouldAutoplay,
  type LivingVideoEvent,
  type LivingVideoPlaybackState,
} from '@/lib/livingVideo/qualification'
import { claimActiveVideo, registerLivingVideo, releaseActiveVideo } from '@/lib/livingVideo/activeVideoOwner'

/**
 * LP7R.2 Living Video — DOM-facing half. All actual decisions (visibility
 * threshold, dwell timing, state transitions) are delegated to the pure
 * functions in src/lib/livingVideo/qualification.ts; this hook's only job
 * is wiring IntersectionObserver + HTMLVideoElement events to those pure
 * functions and exposing refs/state for LivingVideoPlayer to render.
 *
 * Two separate IntersectionObserver instances on the same element, by
 * design: `nearObserver` uses a large rootMargin purely to detect "close
 * enough to start loading metadata" (Task 6 progressive loading), while
 * `preciseObserver` uses a threshold ladder with no rootMargin expansion
 * to get an accurate intersectionRatio for the actual >=60% autoplay
 * qualification check (Task 5) — conflating the two would either delay
 * metadata preload until the video is already mostly on screen, or make
 * the 60% check inaccurate by counting area outside the real viewport.
 */
export function useLivingVideoQualification(id: string) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const [state, setState] = useState<LivingVideoPlaybackState>('poster')
  const [isNearViewport, setIsNearViewport] = useState(false)

  const continuousVisibleSinceRef = useRef<number | null>(null)
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dispatch = useCallback((event: LivingVideoEvent) => {
    setState((current) => nextLivingVideoState(current, event))
  }, [])

  // Register with the single-active-owner coordinator (Task 5/8).
  useEffect(() => {
    const unregister = registerLivingVideo(id, () => dispatch({ type: 'LOSE_OWNERSHIP' }))
    return () => {
      unregister()
      releaseActiveVideo(id)
    }
  }, [id, dispatch])

  // "Near viewport" detection for progressive loading (Task 6).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        const near = entries[0]?.isIntersecting ?? false
        setIsNearViewport(near)
        dispatch(near ? { type: 'ENTER_NEAR_VIEWPORT' } : { type: 'LEAVE_VIEWPORT' })
      },
      { rootMargin: '600px 0px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [dispatch])

  // Precise visibility ratio -> qualification (Task 5's >=60% + dwell rule).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const clearDwellTimer = () => {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current)
        dwellTimerRef.current = null
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 0
        const visible = isVisibleEnough(ratio)

        if (!visible) {
          continuousVisibleSinceRef.current = null
          clearDwellTimer()
          dispatch({ type: 'DISQUALIFY' })
          return
        }

        if (continuousVisibleSinceRef.current == null) {
          continuousVisibleSinceRef.current = Date.now()
        }
        const elapsed = Date.now() - continuousVisibleSinceRef.current
        clearDwellTimer()

        if (shouldAutoplay({ isVisibleEnough: true, continuousVisibleMs: elapsed })) {
          dispatch({ type: 'QUALIFY' })
          claimActiveVideo(id)
        } else {
          const remaining = LIVING_VIDEO_DWELL_MS - elapsed
          dwellTimerRef.current = setTimeout(() => {
            dispatch({ type: 'QUALIFY' })
            claimActiveVideo(id)
          }, Math.max(remaining, 0))
        }
      },
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearDwellTimer()
    }
  }, [dispatch, id])

  // Drive the actual <video> element from playback state.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (state === 'ready') {
      video.muted = true
      const attempt = video.play()
      if (attempt && typeof attempt.then === 'function') {
        attempt
          .then(() => dispatch({ type: 'AUTOPLAY_SUCCEEDED' }))
          .catch(() => dispatch({ type: 'AUTOPLAY_BLOCKED' }))
      }
      return
    }

    if (state === 'autoplay-muted' || state === 'playing-with-sound') {
      if (video.paused) {
        const attempt = video.play()
        if (attempt && typeof attempt.then === 'function') {
          attempt.catch(() => dispatch({ type: 'AUTOPLAY_BLOCKED' }))
        }
      }
      return
    }

    if (state === 'paused' || state === 'offscreen' || state === 'blocked') {
      if (!video.paused) video.pause()
      releaseActiveVideo(id)
    }
  }, [state, dispatch, id])

  const onLoadedMetadata = useCallback(() => dispatch({ type: 'METADATA_LOADED' }), [dispatch])
  const onError = useCallback(() => dispatch({ type: 'ERROR' }), [dispatch])

  const requestPlay = useCallback(() => {
    dispatch({ type: 'USER_PLAY' })
  }, [dispatch])

  const requestPause = useCallback(() => {
    dispatch({ type: 'USER_PAUSE' })
    releaseActiveVideo(id)
  }, [dispatch, id])

  const requestUnmute = useCallback(() => {
    const video = videoRef.current
    if (video) video.muted = false
    dispatch({ type: 'USER_UNMUTE' })
  }, [dispatch])

  return {
    containerRef,
    videoRef,
    state,
    isNearViewport,
    onLoadedMetadata,
    onError,
    requestPlay,
    requestPause,
    requestUnmute,
  }
}
