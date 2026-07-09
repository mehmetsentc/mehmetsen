'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const PULL_THRESHOLD = 72   // px to trigger refresh
const MAX_PULL = 100        // px clamp

export interface UsePullToRefreshOptions {
  /** Container element to watch scroll on. Defaults to window. */
  containerRef?: React.RefObject<HTMLElement | null>
  /** Disable on desktop (default: true — only on touch devices). */
  touchOnly?: boolean
  onRefresh?: () => void | Promise<void>
}

export interface PullToRefreshState {
  pulling: boolean
  pullY: number        // 0 – MAX_PULL
  refreshing: boolean
}

export function usePullToRefresh(options: UsePullToRefreshOptions = {}): PullToRefreshState {
  const { touchOnly = true, onRefresh } = options
  const router = useRouter()
  const [state, setState] = useState<PullToRefreshState>({ pulling: false, pullY: 0, refreshing: false })

  const startX = useRef(0)
  const startY = useRef(0)
  const currentY = useRef(0)
  const refreshing = useRef(false)
  const horizontalLock = useRef(false)

  useEffect(() => {
    const onHorizontalLock = () => {
      horizontalLock.current = true
      startY.current = 0
      setState((s) => ({ ...s, pulling: false, pullY: 0 }))
    }
    window.addEventListener('nahaber:category-swipe-lock', onHorizontalLock)
    return () => window.removeEventListener('nahaber:category-swipe-lock', onHorizontalLock)
  }, [])

  const getScrollTop = useCallback(() => {
    const el = options.containerRef?.current
    return el ? el.scrollTop : window.scrollY
  }, [options.containerRef])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (touchOnly && !('ontouchstart' in window)) return
    if (getScrollTop() > 0) return
    horizontalLock.current = false
    startX.current = e.touches[0]!.clientX
    startY.current = e.touches[0]!.clientY
    currentY.current = startY.current
  }, [touchOnly, getScrollTop])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (horizontalLock.current) return
    if (startY.current === 0) return
    if (getScrollTop() > 0) { startY.current = 0; return }

    const x = e.touches[0]!.clientX
    const y = e.touches[0]!.clientY
    const deltaY = Math.max(0, y - startY.current)
    const deltaX = Math.abs(x - startX.current)
    currentY.current = y

    if (deltaX > 12 && deltaX > deltaY * 1.1) {
      startY.current = 0
      return
    }

    if (deltaY > 8) {
      const clamped = Math.min(deltaY * 0.55, MAX_PULL)
      setState((s) => ({ ...s, pulling: true, pullY: clamped }))
    }
  }, [getScrollTop])

  const handleTouchEnd = useCallback(async () => {
    if (!state.pulling || refreshing.current) {
      startY.current = 0
      setState({ pulling: false, pullY: 0, refreshing: false })
      return
    }

    const delta = currentY.current - startY.current
    startY.current = 0

    if (delta * 0.55 >= PULL_THRESHOLD) {
      refreshing.current = true
      setState({ pulling: false, pullY: 0, refreshing: true })
      try {
        if (onRefresh) {
          await onRefresh()
        } else {
          router.refresh()
        }
      } finally {
        setTimeout(() => {
          refreshing.current = false
          setState({ pulling: false, pullY: 0, refreshing: false })
        }, 600)
      }
    } else {
      setState({ pulling: false, pullY: 0, refreshing: false })
    }
  }, [state.pulling, onRefresh, router])

  useEffect(() => {
    const el = options.containerRef?.current ?? window
    el.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true })
    el.addEventListener('touchmove', handleTouchMove as EventListener, { passive: true })
    el.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleTouchStart as EventListener)
      el.removeEventListener('touchmove', handleTouchMove as EventListener)
      el.removeEventListener('touchend', handleTouchEnd as EventListener)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, options.containerRef])

  return state
}
