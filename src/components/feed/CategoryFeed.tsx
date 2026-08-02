'use client'

import { CategoryExperience } from '@/components/experience/CategoryExperience'
import type { TimelinePost } from '@/types/post'

interface CategoryFeedProps {
  categoryId: string
  initialPosts?: TimelinePost[]
}

/** Tablet category — same NaHaber 3.0 experience as desktop. */
export function CategoryFeed({ categoryId, initialPosts = [] }: CategoryFeedProps) {
  return (
    <CategoryExperience
      categoryId={categoryId}
      initialPosts={initialPosts}
      breakpoint="mobile"
    />
  )
}
