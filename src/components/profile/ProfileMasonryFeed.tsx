'use client'

import { useMemo } from 'react'
import { Newspaper } from 'lucide-react'
import { AdaptiveMasonry } from '@/components/experience/AdaptiveMasonry'
import { buildExperienceSlots } from '@/components/experience/feedRhythm'
import type { Post, TimelinePost } from '@/types/post'

interface ProfileMasonryFeedProps {
  posts: Post[]
  loading?: boolean
  emptyMessage?: string
}

function postsToTimeline(posts: Post[]): TimelinePost[] {
  return posts.map((p) => ({ ...p } as TimelinePost))
}

export function ProfileMasonryFeed({
  posts,
  loading,
  emptyMessage = 'Henüz içerik yok',
}: ProfileMasonryFeedProps) {
  const timelinePosts = useMemo(() => postsToTimeline(posts), [posts])
  const slots = useMemo(() => buildExperienceSlots(timelinePosts), [timelinePosts])

  if (loading) {
    return (
      <div className="exp-masonry p-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="mb-4 inline-block w-full animate-pulse rounded-xl bg-[rgb(var(--color-border))]"
            style={{ height: `${180 + (i % 3) * 60}px` }}
          />
        ))}
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Newspaper className="profile-empty-icon mb-3 h-10 w-10" />
        <p className="text-sm text-[rgb(var(--color-muted))]">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="min-w-0 pt-4">
      <AdaptiveMasonry slots={slots} priorityCount={2} />
    </div>
  )
}
