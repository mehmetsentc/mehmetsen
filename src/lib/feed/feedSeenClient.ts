'use client'

import { useCallback, useRef } from 'react'
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
    const raw = sessionStorage.getItem(GUEST_SEEN_STORAGE_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(arr)
  } catch {
    return new Set()
  }
}

export function writeGuestSeen(ids: Set<string>): void {
  if (typeof window === 'undefined') return
  const arr = [...ids].slice(-GUEST_SEEN_MAX)
  sessionStorage.setItem(GUEST_SEEN_STORAGE_KEY, JSON.stringify(arr))
}

export function useFeedImpressionRef(
  articleId: string,
  isActive: boolean,
  onQualified: () => void
): (node: HTMLElement | null) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  return useCallback(
    (node: HTMLElement | null) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      firedRef.current = false
      if (!node || !isActive) return

      const observer = new IntersectionObserver(
        (entries) => {
          const ratio = entries[0]?.intersectionRatio ?? 0
          const visible = ratio >= FEED_IMPRESSION_CONFIG.visibilityRatio
          if (visible && !firedRef.current) {
            timerRef.current = setTimeout(() => {
              if (!firedRef.current) {
                firedRef.current = true
                onQualified()
              }
            }, FEED_IMPRESSION_CONFIG.minVisibleMs)
          } else if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
        },
        { threshold: [0, 0.6, 1] }
      )
      observer.observe(node)
      return () => {
        observer.disconnect()
        if (timerRef.current) clearTimeout(timerRef.current)
      }
    },
    [articleId, isActive, onQualified]
  )
}
