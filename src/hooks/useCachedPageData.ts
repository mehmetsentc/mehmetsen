'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CACHE_TTL, type CachePersistence } from '@/lib/clientCache'
import { useAppState } from '@/store/appStateContext'

interface UseCachedPageDataOptions {
  ttl?: number
  persistence?: CachePersistence
  enabled?: boolean
}

/**
 * Stale-while-revalidate: paint cached data instantly, refresh in background.
 */
export function useCachedPageData<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  options: UseCachedPageDataOptions = {}
) {
  const { getCachedFeed, setCachedFeed } = useAppState()
  const { ttl = CACHE_TTL.DEFAULT, persistence = 'session', enabled = true } = options
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const [data, setData] = useState<T | null>(() =>
    enabled ? getCachedFeed<T>(cacheKey, persistence) : null
  )
  const [loading, setLoading] = useState(enabled && data === null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      const fresh = await fetcherRef.current()
      setData(fresh)
      setCachedFeed(cacheKey, fresh, ttl, persistence)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      throw err
    } finally {
      setLoading(false)
    }
  }, [cacheKey, enabled, setCachedFeed, ttl, persistence])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    let cancelled = false
    const cached = getCachedFeed<T>(cacheKey, persistence)
    if (cached) {
      setData(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    void fetcherRef
      .current()
      .then((fresh) => {
        if (cancelled) return
        setData(fresh)
        setCachedFeed(cacheKey, fresh, ttl, persistence)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        if (!cached) {
          setError(err instanceof Error ? err.message : 'Yüklenemedi')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, enabled, getCachedFeed, setCachedFeed, ttl, persistence])

  return { data, loading, error, refresh, setData }
}
