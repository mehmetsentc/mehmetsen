import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NewsTimeline } from '@/components/feed/NewsTimeline'
import { NewsCardSkeleton } from '@/components/ui/Skeleton'

export const metadata: Metadata = {
  title: 'Son Dakika',
  description: 'Son dakika haberleri, videolar ve gönderiler — kronolojik akış',
}

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <NewsCardSkeleton key={i} />
          ))}
        </div>
      }
    >
      <NewsTimeline />
    </Suspense>
  )
}
