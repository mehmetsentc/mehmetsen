'use client'

import { useCallback, useEffect, useRef } from 'react'
import { FEED_IMPRESSION_CONFIG, GUEST_SEEN_MAX, GUEST_SEEN_STORAGE_KEY } from '@/lib/feed/config'

export function getOrCreateFeedSessionId(): string {
  if (typeof window === 'undefined') return ''
  const key = 'nahaber_feed_session_v1'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

export function readGuestSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    // Prefer durable localStorage so refresh / re-entry suppress already-read cards.
    // Migrate legacy sessionStorage once if present.
    const fromLocal = localStorage.getItem(GUEST_SEEN_STORAGE_KEY)
    if (fromLocal) {
      const arr = JSON.parse(fromLocal) as string[]
      return new Set(arr)
    }
    const fromSession = sessionStorage.getItem(GUEST_SEEN_STORAGE_KEY)
    if (fromSession) {
      const arr = JSON.parse(fromSession) as string[]
      localStorage.setItem(GUEST_SEEN_STORAGE_KEY, fromSession)
      sessionStorage.removeItem(GUEST_SEEN_STORAGE_KEY)
      return new Set(arr)
    }
    return new Set()
  } catch {
    return new Set()
  }
}

export function writeGuestSeen(ids: Set<string>): void {
  if (typeof window === 'undefined') return
  const arr = [...ids].slice(-GUEST_SEEN_MAX)
  try {
    localStorage.setItem(GUEST_SEEN_STORAGE_KEY, JSON.stringify(arr))
  } catch {
    try {
      sessionStorage.setItem(GUEST_SEEN_STORAGE_KEY, JSON.stringify(arr))
    } catch {
      /* quota / private mode */
    }
  }
}

export function useFeedImpressionRef(
  articleId: string,
  isActive: boolean,
  onQualified: () => void
): (node: HTMLElement | null) => void {
  const nodeRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const onQualifiedRef = useRef(onQualified)
  onQualifiedRef.current = onQualified

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
  }, [])

  useEffect(() => {
    cleanup()
    firedRef.current = false
    const node = nodeRef.current
    if (!node || !isActive) return

    if (typeof IntersectionObserver === 'undefined') {
      timerRef.current = setTimeout(() => {
        if (!firedRef.current) {
          firedRef.current = true
          timerRef.current = null
          onQualifiedRef.current()
        }
      }, FEED_IMPRESSION_CONFIG.minVisibleMs)
      return cleanup
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 0
        const visible = ratio >= FEED_IMPRESSION_CONFIG.visibilityRatio
        if (visible && !firedRef.current) {
          if (!timerRef.current) {
            timerRef.current = setTimeout(() => {
              if (!firedRef.current) {
                firedRef.current = true
                timerRef.current = null
                onQualifiedRef.current()
              }
            }, FEED_IMPRESSION_CONFIG.minVisibleMs)
          }
        } else if (!visible && timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
      },
      { threshold: [0, 0.6, 1] }
    )

    observer.observe(node)
    observerRef.current = observer

    return cleanup
  }, [articleId, isActive, cleanup])

  return useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node
      if (!node) {
        cleanup()
      }
    },
    [cleanup]
  )
}
