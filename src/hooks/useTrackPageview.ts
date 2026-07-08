'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Fires a pageview event to /api/analytics/track on every route change.
 * Pass postId when on an article page to also increment the article's viewCount.
 */
export function useTrackPageview(postId?: string) {
  const pathname = usePathname()
  const lastTracked = useRef<string>('')

  useEffect(() => {
    const key = `${pathname}__${postId ?? ''}`
    if (lastTracked.current === key) return
    lastTracked.current = key

    // Fire and forget — don't block render
    const referrer = typeof document !== 'undefined' ? document.referrer : ''

    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname, referrer, postId }),
      keepalive: true,
    }).catch(() => { /* ignore network errors */ })
  }, [pathname, postId])
}
