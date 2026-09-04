import type { Metadata } from 'next'
import { SmartFeedClient } from '@/components/feed/smart/SmartFeedClient'
import { FullscreenNewsCardSkeleton } from '@/components/feed/smart/FullscreenNewsCardSkeleton'
import { hasDatabaseUrl } from '@/db'
import { FEED_PAGINATION } from '@/lib/feed/config'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { feedService } from '@/services/feed/FeedService'
import type { FeedPageDto } from '@/types/smartFeed'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Akıllı Haber Akışı',
  description: 'Tam ekran dikey haber akışı — canlı kategoriler ve keşif.',
  robots: { index: false, follow: false },
}

/**
 * SSR paints skeleton + boots first feed page so hydration is not blocked on
 * Firebase auth/profile (which previously left a 10–15s black wait).
 */
export default async function FeedV2Page() {
  const debug = process.env.NODE_ENV !== 'production'
  let initialPage: FeedPageDto | null = null

  try {
    if (hasDatabaseUrl() && (await isSmartFeedEffectiveForUser(null))) {
      initialPage = await feedService.getFeed({
        userId: null,
        sessionId: null,
        mode: 'personal',
        limit: FEED_PAGINATION.defaultLimit,
        surface: 'feed-v2',
      })
    }
  } catch (err) {
    console.warn('[feed-v2] SSR bootstrap failed', err)
  }

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
        {initialPage?.items?.length ? null : <FullscreenNewsCardSkeleton />}
        <div className="absolute inset-0 z-30">
          <SmartFeedClient initialPage={initialPage} debug={debug} />
        </div>
      </div>
    </div>
  )
}
