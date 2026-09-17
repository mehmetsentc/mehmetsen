'use client'

import dynamic from 'next/dynamic'
import type { VideoFeedSurface } from '@/lib/videoFeed/types'
import { BrandBootSplash } from '@/components/brand/BrandBootSplash'

function ReelsBootSkeleton() {
  return (
    <BrandBootSplash
      className="absolute inset-0 min-h-0"
      label="Video yükleniyor…"
      variant="inset"
      testId="reels-boot-splash"
    />
  )
}

const ReelsPageClient = dynamic(
  () => import('@/components/video/ReelsPageClient').then((m) => ({ default: m.ReelsPageClient })),
  {
    ssr: false,
    loading: ReelsBootSkeleton,
  }
)

export function ReelsLoader({ surface = 'reels' }: { surface?: VideoFeedSurface }) {
  return <ReelsPageClient surface={surface} />
}
