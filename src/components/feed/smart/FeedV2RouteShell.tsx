import { FeedBootSplash } from '@/components/feed/smart/FeedBootSplash'
import { FEED_READER_SURFACE_CLASS, FEED_V2_CHROME_CSS_VARS } from '@/lib/feed/reader/feedChrome'
import { cn } from '@/lib/utils'
import type { CSSProperties, ReactNode } from 'react'

/** Shared black stage for /feed-v2 page + loading so soft-nav never flashes empty. */
export function FeedV2RouteShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative h-full min-h-0 w-full bg-black overflow-hidden flex justify-center select-none"
      data-testid="smart-feed-ssr-shell"
    >
      <div
        className={cn(
          'relative h-full min-h-0 overflow-hidden bg-black flex flex-col',
          FEED_READER_SURFACE_CLASS
        )}
        style={FEED_V2_CHROME_CSS_VARS as CSSProperties}
        data-feed-surface="1"
      >
        {children}
      </div>
    </div>
  )
}

export function FeedV2BootFallback() {
  return (
    <FeedV2RouteShell>
      <FeedBootSplash />
    </FeedV2RouteShell>
  )
}
