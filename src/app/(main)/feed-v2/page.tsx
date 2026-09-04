import type { Metadata } from 'next'
import { SmartFeedClient } from '@/components/feed/smart/SmartFeedClient'
import { FullscreenNewsCardSkeleton } from '@/components/feed/smart/FullscreenNewsCardSkeleton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Akıllı Haber Akışı',
  description: 'Tam ekran dikey haber akışı — canlı kategoriler ve keşif.',
  robots: { index: false, follow: false },
}

/**
 * SSR paints the black shell + skeleton immediately so first open is never a
 * naked blank wait for JS hydration / auth.
 */
export default function FeedV2Page() {
  const debug = process.env.NODE_ENV !== 'production'

  return (
    <div
      className="relative h-[100dvh] w-full bg-black overflow-hidden flex justify-center select-none"
      data-testid="smart-feed-ssr-shell"
    >
      <div className="relative h-[100dvh] w-full md:max-w-lg md:mx-auto overflow-hidden bg-black flex flex-col">
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-40 h-14 bg-gradient-to-b from-black/50 to-transparent"
          aria-hidden
        />
        <FullscreenNewsCardSkeleton />
        <div className="absolute inset-0 z-30">
          <SmartFeedClient debug={debug} />
        </div>
      </div>
    </div>
  )
}
