'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { useConsent } from '@/hooks/useConsent'

const ADSENSE_CLIENT = 'ca-pub-2018428956792076'

/**
 * Loads AdSense + Vercel analytics after first paint.
 *
 * AdSense uses Google Consent Mode v2:
 * - The publisher script ALWAYS loads so Google can verify the site and
 *   serve non-personalized ads to first-time visitors (no consent banner
 *   interaction required for basic ad delivery).
 * - Consent signals are communicated via gtag('consent', 'update', {...})
 *   which upgrades ad storage / personalization once the user accepts.
 *
 * Without always loading the script, Google's crawler can't verify the
 * publisher code and the AdSense account review will fail.
 */
export function DeferredThirdParty() {
  const { analyticsAllowed, marketingAllowed, ready } = useConsent()
  const [readyIdle, setReadyIdle] = useState(false)

  useEffect(() => {
    let cancelled = false
    const enable = () => {
      if (!cancelled) setReadyIdle(true)
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(enable, { timeout: 4000 })
      return () => {
        cancelled = true
        window.cancelIdleCallback(id)
      }
    }

    const t = globalThis.setTimeout(enable, 2500)
    return () => {
      cancelled = true
      globalThis.clearTimeout(t)
    }
  }, [])

  // Push Consent Mode v2 update whenever the user's decision changes.
  // This runs after readyIdle so it doesn't block LCP.
  useEffect(() => {
    if (!ready || !readyIdle) return
    if (typeof window === 'undefined') return
    const w = window as Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
    w.dataLayer = w.dataLayer ?? []
    if (!w.gtag) {
      w.gtag = function gtag(...args: unknown[]) { w.dataLayer!.push(args) }
    }
    w.gtag('consent', 'update', {
      ad_storage: marketingAllowed ? 'granted' : 'denied',
      ad_user_data: marketingAllowed ? 'granted' : 'denied',
      ad_personalization: marketingAllowed ? 'granted' : 'denied',
      analytics_storage: analyticsAllowed ? 'granted' : 'denied',
    })
  }, [ready, readyIdle, analyticsAllowed, marketingAllowed])

  if (!readyIdle) return null

  return (
    <>
      {/* AdSense — always load for publisher verification + Consent Mode v2.
          Non-personalized ads are shown until marketing consent is granted. */}
      <Script
        id="adsbygoogle"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        strategy="lazyOnload"
        crossOrigin="anonymous"
      />
      <Analytics />
      <SpeedInsights />
    </>
  )
}
