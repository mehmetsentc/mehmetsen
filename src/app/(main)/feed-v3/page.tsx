import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { SmartFeedClient } from '@/components/feed/smart/SmartFeedClient'
import { FullscreenNewsCardSkeleton } from '@/components/feed/smart/FullscreenNewsCardSkeleton'
import { hasDatabaseUrl } from '@/db'
import { FEED_PAGINATION } from '@/lib/feed/config'
import {
  FEED_READER_SURFACE_CLASS,
  FEED_V2_CHROME_CSS_VARS,
} from '@/lib/feed/reader/feedChrome'
import { isSmartFeedEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { feedService } from '@/services/feed/FeedService'
import type { FeedPageDto } from '@/types/smartFeed'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Akıllı Haber Akışı V3 (Sheet)',
  description: 'Feed V2 kopyası — haber detayı bottom sheet ile (lokal deney).',
  robots: { index: false, follow: false },
}

/**
 * Feed V3 — copy of Feed V2 with bottom-sheet article presentation.
 * Local experiment only until explicitly deployed.
 */
export default async function FeedV3Page() {
  const debug = process.env.NODE_ENV !== 'production'
  let initialPage: FeedPageDto | null = null

  try {
    if (hasDatabaseUrl() && (await isSmartFeedEffectiveForUser(null))) {
      initialPage = await feedService.getFeed({
        userId: null,
        sessionId: null,
        mode: 'personal',
        limit: FEED_PAGINATION.defaultLimit,
        // Same ranking surface as V2 for identical feed content.
        surface: 'feed-v2',
      })
    }
  } catch (err) {
    console.warn('[feed-v3] SSR bootstrap failed', err)
  }

  return (
    <div
      className="relative h-full min-h-0 w-full bg-black overflow-hidden flex justify-center select-none"
      data-testid="smart-feed-v3-ssr-shell"
    >
      <div
        className={cn(
          'relative h-full min-h-0 overflow-hidden bg-black flex flex-col',
          FEED_READER_SURFACE_CLASS
        )}
        style={FEED_V2_CHROME_CSS_VARS as CSSProperties}
        data-feed-surface="1"
        data-feed-v3="1"
      >
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-40 h-14 bg-gradient-to-b from-black/50 to-transparent"
          aria-hidden
        />
        {initialPage?.items?.length ? null : <FullscreenNewsCardSkeleton />}
        <div className="absolute inset-0 z-30">
          <SmartFeedClient initialPage={initialPage} debug={debug} presentation="sheet" />
        </div>
      </div>
    </div>
  )
}
