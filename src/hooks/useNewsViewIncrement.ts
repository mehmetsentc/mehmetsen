'use client'

import { useEffect, useRef } from 'react'
import { ENGAGEMENT_SAFETY_FLUSH_MS } from '@/lib/feed/articleEngagement'
import { createEngagementTracker } from '@/lib/feed/articleEngagementClient'

/**
 * /haber page-tab view (once per session) + page dwell while the tab is visible.
 * Feed/story/reader trackers stay on their own surfaces.
 */
export function useNewsViewIncrement(postId: string | undefined) {
  const trackerRef = useRef<ReturnType<typeof createEngagementTracker> | null>(null)
  if (!trackerRef.current) trackerRef.current = createEngagementTracker('page')

  useEffect(() => {
    if (!postId) return
    const tracker = trackerRef.current
    if (!tracker) return

    tracker.start(postId)
    tracker.flush(postId)

    // Opening view is one write. Further dwell waits for hide, pagehide, unmount,
    // or this 120s checkpoint. A 10-minute read is about 5 checkpoints, not 20.
    const heartbeat = window.setInterval(() => tracker.flush(postId), ENGAGEMENT_SAFETY_FLUSH_MS)
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
