'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { useConsent } from '@/hooks/useConsent'

const ADSENSE_CLIENT = 'ca-pub-2018428956792076'

/**
 * Defer ads + Vercel analytics until after first paint / idle so they do not
 * compete with LCP on mobile.
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

  if (!ready || !readyIdle) return null

  const adsAllowed = marketingAllowed || analyticsAllowed

  return (
    <>
      {adsAllowed ? (
        <Script
          id="adsbygoogle"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          strategy="lazyOnload"
          crossOrigin="anonymous"
        />
      ) : null}
      <Analytics />
      <SpeedInsights />
    </>
  )
}
