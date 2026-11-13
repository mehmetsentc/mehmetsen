'use client'

import { useEffect } from 'react'
import { track } from '@vercel/analytics'

/**
 * SOCIAL-UTM-2: Vercel's UTM report needs the paid Web Analytics Plus plan, but
 * custom events are on our plan. A visitor who lands from a tagged social link
 * sends one «social_landing» event (source / campaign / account), so Analytics
 * → Events shows which platform, format and account brings readers.
 */
export function utmLandingProps(search: string): Record<string, string> | null {
  const q = new URLSearchParams(search)
  const source = q.get('utm_source')?.trim()
  if (!source || q.get('utm_medium') !== 'social') return null
  return {
    source: source.slice(0, 40),
    campaign: (q.get('utm_campaign') ?? '').slice(0, 40),
    account: (q.get('utm_content') ?? '').slice(0, 80),
  }
}

export function UtmLandingTracker() {
  useEffect(() => {
    try {
      const props = utmLandingProps(window.location.search)
      if (props) track('social_landing', props)
    } catch {
      /* analytics must never break the page */
    }
  }, [])
  return null
}
