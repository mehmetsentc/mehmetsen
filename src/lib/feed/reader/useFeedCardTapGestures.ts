'use client'

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  FEED_CARD_DOUBLE_TAP_MS,
  FEED_CARD_TAP_MOVE_PX,
  decideFeedCardTap,
  shouldIgnoreFeedCardTapTarget,
} from '@/lib/feed/reader/feedCardTapGesture'

type TapTarget = HTMLElement

/**
 * Instagram-style Feed 2 tap: wait DOUBLE_TAP_MS so a second tap likes
 * instead of opening the reader. Used by every SmartFeed surface.
 */
export function useFeedCardTapGestures(opts: {
  onSingleTap: () => void
  onDoubleTapLike: (clientX: number, clientY: number, target: TapTarget) => void
}) {
  const lastTapRef = useRef(0)
  const tapOriginRef = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)
  const singleTapTimerRef = useRef<number | null>(null)
  const onSingleTapRef = useRef(opts.onSingleTap)
  const onDoubleTapLikeRef = useRef(opts.onDoubleTapLike)
  onSingleTapRef.current = opts.onSingleTap
  onDoubleTapLikeRef.current = opts.onDoubleTapLike

  const clearSingleTapOpen = useCallback(() => {
    if (singleTapTimerRef.current != null) {
      window.clearTimeout(singleTapTimerRef.current)
      singleTapTimerRef.current = null
    }
  }, [])

  useEffect(() => () => clearSingleTapOpen(), [clearSingleTapOpen])

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    movedRef.current = false
    tapOriginRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const origin = tapOriginRef.current
      if (!origin) return
      if (
        Math.abs(e.clientX - origin.x) > FEED_CARD_TAP_MOVE_PX ||
        Math.abs(e.clientY - origin.y) > FEED_CARD_TAP_MOVE_PX
      ) {
        movedRef.current = true
        clearSingleTapOpen()
      }
    },
    [clearSingleTapOpen]
  )

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const decision = decideFeedCardTap({
        moved: movedRef.current,
        ignoreTarget: shouldIgnoreFeedCardTapTarget(e.target),
        now: Date.now(),
        lastTapAt: lastTapRef.current,
      })
      tapOriginRef.current = null
      if (decision === 'ignore') {
        lastTapRef.current = 0
        clearSingleTapOpen()
        return
      }
      if (decision === 'double-like') {
        lastTapRef.current = 0
        clearSingleTapOpen()
        onDoubleTapLikeRef.current(e.clientX, e.clientY, e.currentTarget)
        return
      }
      lastTapRef.current = Date.now()
      clearSingleTapOpen()
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null
        lastTapRef.current = 0
        onSingleTapRef.current()
      }, FEED_CARD_DOUBLE_TAP_MS)
    },
    [clearSingleTapOpen]
  )

  const onPointerCancel = useCallback(() => {
    lastTapRef.current = 0
    tapOriginRef.current = null
    clearSingleTapOpen()
  }, [clearSingleTapOpen])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}
