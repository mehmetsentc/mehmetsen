'use client'

import { useEffect, useState } from 'react'
import { trendingService } from '@/services/trendingService'
import { SEED_TRENDING_TAGS, type TrendingTopic } from '@/lib/trendingUtils'

const FALLBACK: TrendingTopic[] = SEED_TRENDING_TAGS.map((tag) => ({ tag, count: 0 }))

export function useTrendingTopics() {
  const [topics, setTopics] = useState<TrendingTopic[]>(FALLBACK)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void trendingService
      .getTrendingTopics()
      .then((items) => {
        if (!cancelled && items.length > 0) setTopics(items)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { topics, loading }
}
