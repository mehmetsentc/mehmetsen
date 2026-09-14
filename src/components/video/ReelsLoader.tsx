'use client'

import dynamic from 'next/dynamic'
import type { VideoFeedSurface } from '@/lib/videoFeed/types'

function ReelsBootSkeleton() {
  return (
    <div className="nl-video-boot pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black via-transparent to-black/40 p-6">
      <p className="nl-video-boot__title text-sm font-semibold text-white/90">Video Haberler</p>
      <p className="nl-video-boot__meta mt-1 text-xs text-white/50">Yükleniyor…</p>
    </div>
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
