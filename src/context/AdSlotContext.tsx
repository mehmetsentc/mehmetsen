'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AdBannerPublic } from '@/types/adBanner'

interface AdSlotContextValue {
  ads: Record<string, AdBannerPublic | null>
  loading: boolean
}

const AdSlotContext = createContext<AdSlotContextValue>({ ads: {}, loading: true })

export function AdSlotProvider({
  page,
  categoryId,
  children,
}: {
  page: 'home' | 'category'
  categoryId?: string
  children: React.ReactNode
}) {
  const [ads, setAds] = useState<Record<string, AdBannerPublic | null>>({})
  const [loading, setLoading] = useState(true)

  const query = useMemo(() => {
    const params = new URLSearchParams({ page })
    if (categoryId) params.set('categoryId', categoryId)
    return `/api/ads?${params.toString()}`
  }, [page, categoryId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(query)
      .then((r) => r.json())
      .then((json: { ads?: Record<string, AdBannerPublic | null> }) => {
        if (!cancelled) setAds(json.ads ?? {})
      })
      .catch(() => {
        if (!cancelled) setAds({})
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [query])

  const value = useMemo(() => ({ ads, loading }), [ads, loading])

  return <AdSlotContext.Provider value={value}>{children}</AdSlotContext.Provider>
}

export function useAdSlot(slotId: string): AdBannerPublic | null {
  const { ads } = useContext(AdSlotContext)
  return ads[slotId] ?? null
}
