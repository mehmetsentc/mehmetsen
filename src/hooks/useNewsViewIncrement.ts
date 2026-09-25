'use client'

import { useEffect, useRef } from 'react'
import { createEngagementTracker } from '@/lib/feed/articleEngagementClient'

/**
 * Article-open view (once per session) + total read-time while the page is visible.
 */
export function useNewsViewIncrement(postId: string | undefined) {
  const trackerRef = useRef<ReturnType<typeof createEngagementTracker> | null>(null)
  if (!trackerRef.current) trackerRef.current = createEngagementTracker('open')

  useEffect(() => {
    if (!postId) return
    const tracker = trackerRef.current
    if (!tracker) return

    tracker.start(postId)
    tracker.flush(postId)

    // FinOps: 10s heartbeat = 6 API calls/min per reader (each: Vercel fn + PG write +
    // Firestore write). Total read time is still exact — visibilitychange/pagehide/unmount
    // flush the remainder — so a 30s heartbeat only coarsens mid-read progress.
    const heartbeat = window.setInterval(() => tracker.flush(postId), 30_000)
    const onVis = () => {
      if (document.visibilityState === 'hidden') tracker.flush(postId)
    }
    const onHide = () => tracker.flush(postId)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
      tracker.end(postId)
    }
  }, [postId])
}
