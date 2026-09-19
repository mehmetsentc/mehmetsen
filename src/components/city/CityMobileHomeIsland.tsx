'use client'

import { useEffect, useState, type ComponentType } from 'react'

type LoaderProps = {
  citySlug: string
  enabled: boolean
}

/**
 * Mobile-only Feed 2. Must not statically import SmartFeed or HomeFeed —
 * those two share a webpack graph under city-site and throw undefined.call.
 */
export function CityMobileHomeIsland({ citySlug }: { citySlug: string }) {
  const [Loader, setLoader] = useState<ComponentType<LoaderProps> | null>(null)

  useEffect(() => {
    if (window.innerWidth >= 1024) return
    let cancelled = false
    void import('./CityMobileFeedLoader').then((mod) => {
      if (!cancelled) setLoader(() => mod.CityMobileFeedLoader)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!Loader) {
    return <div className="min-h-[28rem] w-full bg-[rgb(var(--color-surface))]" aria-hidden />
  }
  return <Loader citySlug={citySlug} enabled />
}
