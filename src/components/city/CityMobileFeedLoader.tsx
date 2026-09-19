'use client'

import { useEffect, useState, type ComponentType } from 'react'

type SmartFeedProps = {
  initialPage: null
  initialCitySlug: string
  lockCitySlug: boolean
}

/**
 * Load SmartFeed only after mount on mobile. A static/dynamic import on the
 * city home page shares a webpack graph with newspaper chrome and throws
 * `undefined.call` during desktop hydrate.
 */
export function CityMobileFeedLoader({
  citySlug,
  enabled,
}: {
  citySlug: string
  enabled: boolean
}) {
  const [Feed, setFeed] = useState<ComponentType<SmartFeedProps> | null>(null)

  useEffect(() => {
    if (!enabled) {
      setFeed(null)
      return
    }
    let cancelled = false
    void import('@/components/feed/smart/SmartFeedClient').then((mod) => {
      if (!cancelled) setFeed(() => mod.SmartFeedClient)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  if (!enabled || !Feed) return null

  return (
    <div
      className="relative h-full min-h-[28rem] w-full bg-black overflow-hidden"
      data-testid="smart-feed-ssr-shell"
      data-city-feed="1"
    >
      <Feed initialPage={null} initialCitySlug={citySlug} lockCitySlug />
    </div>
  )
}
