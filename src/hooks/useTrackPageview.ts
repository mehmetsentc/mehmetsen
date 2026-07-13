'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Fires a pageview event to /api/analytics/track on every route change.
 * Pass postId when on an article page to also increment the article's viewsCount.
 */
export function useTrackPageview(postId?: string) {
  const pathname = usePathname()
  const lastTracked = useRef<string>('')

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin') || pathname.startsWith('/api')) return

    const key = `${pathname}__${postId ?? ''}`
    if (lastTracked.current === key) return
    lastTracked.current = key

    const referrer = typeof document !== 'undefined' ? document.referrer : ''
    const payload = JSON.stringify({ path: pathname, referrer, postId })

    // Prefer sendBeacon so navigations / tab closes still record the hit
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' })
        if (navigator.sendBeacon('/api/analytics/track', blob)) return
      }
    } catch {
      /* fall through to fetch */
    }

    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {})
  }, [pathname, postId])
}
