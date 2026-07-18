'use client'

import { useState } from 'react'
import { CategoryExperience } from '@/components/experience/CategoryExperience'
import { getCache } from '@/lib/clientCache'
import { PAGE_CACHE_KEYS } from '@/lib/pageCache'
import type { TimelinePost } from '@/types/post'

interface CategoryFeedProps {
  categoryId: string
  initialPosts?: TimelinePost[]
}

export function CategoryFeed({ categoryId, initialPosts: serverPosts }: CategoryFeedProps) {
  const cacheKey = PAGE_CACHE_KEYS.category(categoryId)

  const [cachedPosts] = useState<TimelinePost[]>(
    () => (serverPosts?.length ? serverPosts : (getCache<TimelinePost[]>(cacheKey) ?? []))
  )

  return (
    <CategoryExperience
      categoryId={categoryId}
      initialPosts={cachedPosts}
      breakpoint="mobile"
    />
  )
}
