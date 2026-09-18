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

export async function CitySmartFeedPage({
  citySlug,
  category = null,
  skipSsr = false,
}: {
  citySlug: string
  category?: string | null
  skipSsr?: boolean
}) {
  const debug = false
  let initialPage: FeedPageDto | null = null

  try {
    if (!skipSsr && hasDatabaseUrl() && (await isSmartFeedEffectiveForUser(null))) {
      initialPage = await feedService.getFeed({
        userId: null,
        sessionId: null,
        mode: 'personal',
        limit: FEED_PAGINATION.defaultLimit,
        surface: 'feed-v2',
        citySlug,
        lockCity: true,
        category,
      })
    }
  } catch (err) {
    console.warn('[city-feed] SSR bootstrap failed', err)
  }

  return (
    <div
      className="relative h-full min-h-[28rem] w-full bg-black overflow-hidden flex justify-center select-none"
      data-testid="smart-feed-ssr-shell"
      data-city-feed="1"
    >
      <div
        className={cn(
          'relative h-full min-h-[28rem] w-full overflow-hidden bg-black flex flex-col',
          FEED_READER_SURFACE_CLASS
        )}
        style={FEED_V2_CHROME_CSS_VARS as CSSProperties}
        data-feed-surface="1"
      >
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-40 h-14 bg-gradient-to-b from-black/50 to-transparent"
          aria-hidden
        />
        {initialPage?.items?.length ? null : <FullscreenNewsCardSkeleton />}
        <div className="absolute inset-0 z-30">
          <SmartFeedClient
            initialPage={initialPage}
            initialCitySlug={citySlug}
            lockCitySlug
            debug={debug}
          />
        </div>
      </div>
    </div>
  )
}
