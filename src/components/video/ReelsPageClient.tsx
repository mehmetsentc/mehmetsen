'use client'

import { Suspense } from 'react'
import { VideoFeed } from '@/components/video/VideoFeed'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'
import { cn } from '@/lib/utils'
import type { VideoFeedSurface } from '@/lib/videoFeed/types'

function ReelsLoadingFallback({ newspaper }: { newspaper?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-h-[min(72dvh,520px)] flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        newspaper
          ? 'bg-[rgb(246_243_236)] text-[#111]'
          : 'bg-black'
      )}
    >
      <div
        className={cn(
          'h-10 w-10 animate-spin rounded-full border-4',
          newspaper ? 'border-[#111]/20 border-t-[#E50914]' : 'border-white/40 border-t-white'
        )}
      />
      <p className={cn('text-sm', newspaper ? 'text-[#111]/60' : 'text-white/60')}>
        Videolar yükleniyor...
      </p>
    </div>
  )
}

/**
 * /reels stays immersive. Desktop /video sits under the newspaper masthead.
 */
export function ReelsPageClient({ surface = 'reels' }: { surface?: VideoFeedSurface }) {
  const { isDesktop } = usePlatformLayout()
  const newspaperVideo = surface === 'video' && isDesktop

  return (
    <div
      className={cn(
        'h-full min-h-0',
        newspaperVideo ? 'nl-video-shell' : 'dark'
      )}
      style={newspaperVideo ? undefined : { colorScheme: 'dark' }}
    >
      <div
        className={cn(
          'relative h-full min-h-0',
          newspaperVideo ? 'nl-video-page' : 'bg-black'
        )}
      >
        <Suspense fallback={<ReelsLoadingFallback newspaper={newspaperVideo} />}>
          <VideoFeed surface={surface} />
        </Suspense>
      </div>
    </div>
  )
}
