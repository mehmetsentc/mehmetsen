'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const CityMobileFeedLoader = dynamic(
  () => import('./CityMobileFeedLoader').then((mod) => mod.CityMobileFeedLoader),
  { ssr: false },
)

/**
 * Layout-level mobile Feed 2. City home RSC must never import SmartFeed —
 * this slot loads it only after a mobile viewport is confirmed.
 */
export function CityMobileFeedSlot({
  citySlug,
  enabled,
}: {
  citySlug: string
  enabled: boolean
}) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)')
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  if (!enabled) return null

  return (
    <div className="lg:hidden h-full min-h-[28rem]" data-city-mobile-feed="1">
      {isMobile ? (
        <CityMobileFeedLoader citySlug={citySlug} enabled />
      ) : (
        <div className="min-h-[28rem] w-full bg-[rgb(var(--color-surface))]" aria-hidden />
      )}
    </div>
  )
}
