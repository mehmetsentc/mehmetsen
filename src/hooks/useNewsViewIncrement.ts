'use client'

import { useEffect } from 'react'

const STORAGE_PREFIX = 'nahaber-viewed:'

function alreadyCounted(postId: string): boolean {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + postId) === '1'
  } catch {
    return false
  }
}

function markCounted(postId: string): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + postId, '1')
  } catch {
    // private mode / quota — still fire once this page load
  }
}

/**
 * Increments news.viewsCount once per browser session per article.
 * Uses the cheap /api/news/view endpoint (single FieldValue.increment).
 * Full analytics (/api/analytics/track) stays paused.
 */
export function useNewsViewIncrement(postId: string | undefined) {
  useEffect(() => {
    if (!postId) return
    if (alreadyCounted(postId)) return

    markCounted(postId)

    const payload = JSON.stringify({ id: postId })
    const send = () => {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' })
        if (navigator.sendBeacon('/api/news/view', blob)) return
      }
      fetch('/api/news/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    }

    // Defer past first paint so it never blocks LCP
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(send, { timeout: 2000 })
      return () => window.cancelIdleCallback(idleId)
    }
    const t = setTimeout(send, 400)
    return () => clearTimeout(t)
  }, [postId])
}
