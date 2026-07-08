'use client'

import { useTrackPageview } from '@/hooks/useTrackPageview'

/** Drop this into the root layout — tracks every page navigation automatically. */
export function AnalyticsTracker() {
  useTrackPageview()
  return null
}
