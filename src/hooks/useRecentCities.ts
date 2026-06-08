'use client'

import { useCallback, useEffect, useState } from 'react'
import { CITY_CATEGORIES, mergeCityCategories } from '@/constants/cities'
import { postService } from '@/services/postService'

export type FeedCity = {
  id: string
  slug: string
  name: string
}

export function useRecentCities() {
  const [cities, setCities] = useState<FeedCity[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const recent = await postService.getRecentCities()
      setCities(mergeCityCategories(recent))
    } catch {
      setCities([...CITY_CATEGORIES])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return { cities, loading, refresh }
}
