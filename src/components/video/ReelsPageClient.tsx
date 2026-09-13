'use client'

import { Suspense } from 'react'
import { VideoFeed } from '@/components/video/VideoFeed'
import type { VideoFeedSurface } from '@/lib/videoFeed/types'

function ReelsLoadingFallback() {
  return (
    <div className="flex min-h-[min(72dvh,520px)] flex-col items-center justify-center gap-3 bg-black px-6 py-12 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/40 border-t-white" />
      <p className="text-sm text-white/60">Videolar yükleniyor...</p>
    </div>
  )
}

/**
 * Teve / Video page — forced dark mode, immersive full-screen video feed.
 * Always renders in dark mode regardless of user system preference.
 */
export function ReelsPageClient({ surface = 'reels' }: { surface?: VideoFeedSurface }) {
  return (
    // `dark` class forces Tailwind dark-mode variants for this entire subtree
    <div className="dark h-full min-h-0" style={{ colorScheme: 'dark' }}>
      <div className="relative h-full min-h-0 bg-black">
        {/* Back is provided globally via GlobalBackNav; keep page immersive. */}
        <Suspense fallback={<ReelsLoadingFallback />}>
          <VideoFeed surface={surface} />
        </Suspense>
      </div>
    </div>
  )
}
