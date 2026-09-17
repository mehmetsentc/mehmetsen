import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SmartFeedClient } from '@/components/feed/smart/SmartFeedClient'
import { FeedBootSplash } from '@/components/feed/smart/FeedBootSplash'
import {
  FeedV2BootFallback,
  FeedV2RouteShell,
} from '@/components/feed/smart/FeedV2RouteShell'
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
 * Prod: race SSR feed bootstrap against a short budget so soft-nav can paint
 * the boot splash instead of waiting on a multi-second cold feed query.
 * Dev: skip SSR bootstrap entirely — client fetch + splash (local DX).
 */
const FEED_V2_SSR_BOOT_MS = process.env.NODE_ENV === 'production' ? 2500 : 0

async function loadInitialFeedPage(): Promise<FeedPageDto | null> {
  if (FEED_V2_SSR_BOOT_MS <= 0) return null
  if (!hasDatabaseUrl()) return null
  if (!(await isSmartFeedEffectiveForUser(null))) return null

  try {
    const page = await Promise.race([
      feedService.getFeed({
        userId: null,
        sessionId: null,
        mode: 'personal',
        limit: FEED_PAGINATION.defaultLimit,
        surface: 'feed-v2',
      }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), FEED_V2_SSR_BOOT_MS)
      }),
    ])
    return page
  } catch (err) {
    console.warn('[feed-v2] SSR bootstrap failed', err)
    return null
  }
}

async function FeedV2Boot({ debug }: { debug: boolean }) {
  const initialPage = await loadInitialFeedPage()

  return (
    <FeedV2RouteShell>
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-40 h-14 bg-gradient-to-b from-black/50 to-transparent"
        aria-hidden
      />
      {initialPage?.items?.length ? null : <FeedBootSplash />}
      <div className="absolute inset-0 z-30">
        <SmartFeedClient initialPage={initialPage} debug={debug} />
      </div>
    </FeedV2RouteShell>
  )
}

export default function FeedV2Page() {
  // Card debug overlay only via ?debug=1 (SmartFeedClient), not all local sessions.
  const debug = false

  return (
    <Suspense fallback={<FeedV2BootFallback />}>
      <FeedV2Boot debug={debug} />
    </Suspense>
  )
}
