'use client'

import { Suspense } from 'react'
import { VideoFeed } from '@/components/video/VideoFeed'

function ReelsLoadingFallback() {
  return (
    <div className="flex min-h-[min(72dvh,520px)] flex-col items-center justify-center gap-3 bg-black px-6 py-12 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/40 border-t-white" />
      <p className="text-sm text-white/60">Videolar yükleniyor...</p>
    </div>
  )
}

/**
 * Teve page — forced dark mode, immersive full-screen video feed.
 * Always renders in dark mode regardless of user system preference.
 */
export function ReelsPageClient() {
  return (
    // `dark` class forces Tailwind dark-mode variants for this entire subtree
    <div className="dark" style={{ colorScheme: 'dark' }}>
      <div className="relative min-h-screen bg-black">
        {/* Back is provided globally via GlobalBackNav; keep page immersive. */}
        <Suspense fallback={<ReelsLoadingFallback />}>
          <VideoFeed />
        </Suspense>
      </div>
    </div>
  )
}
