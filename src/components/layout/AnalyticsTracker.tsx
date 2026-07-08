'use client'

import { useTrackPageview } from '@/hooks/useTrackPageview'
import { useWebVitals } from '@/hooks/useWebVitals'

/** Tracks pageviews + Core Web Vitals on every navigation. */
export function AnalyticsTracker() {
  useTrackPageview()
  useWebVitals()
  return null
}
