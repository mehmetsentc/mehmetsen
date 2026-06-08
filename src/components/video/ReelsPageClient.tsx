'use client'

import { Suspense } from 'react'
import { VideoFeed } from '@/components/video/VideoFeed'

function ReelsLoadingFallback() {
  return (
    <div className="flex min-h-[min(72dvh,520px)] flex-col items-center justify-center gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-6 py-12 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      <p className="text-sm text-[rgb(var(--color-muted))]">Videolar yükleniyor...</p>
    </div>
  )
}

export function ReelsPageClient() {
  return (
    <Suspense fallback={<ReelsLoadingFallback />}>
      <VideoFeed />
    </Suspense>
  )
}
