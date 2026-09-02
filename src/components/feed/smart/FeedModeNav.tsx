'use client'

import { cn } from '@/lib/utils'
import { FEED_MODE_LABELS } from '@/lib/feed/config'
import type { FeedMode } from '@/types/smartFeed'

interface FeedModeNavProps {
  mode: FeedMode
  onChange: (mode: FeedMode) => void
  className?: string
}

const MODES: FeedMode[] = ['personal', 'following', 'breaking', 'local']

/**
 * Top mode chips for immersive Smart Feed.
 * Left/right padding clears the floating exit/back control; top padding clears
 * iOS safe-area (and a minimum floor for Safari chrome when sat is small).
 */
export function FeedModeNav({ mode, onChange, className }: FeedModeNavProps) {
  return (
    <nav
      className={cn(
        'absolute left-0 right-0 top-0 z-50 flex justify-center',
        'bg-gradient-to-b from-black/80 via-black/40 to-transparent',
        // Clear GlobalBackNav on the left; keep chips tappable on narrow phones.
        'pl-14 pr-3 pb-3',
        // Floor 2.75rem so chips sit below status/notch even when sat≈0 in some browsers.
        'pt-[max(2.75rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+0.85rem))]',
        className
      )}
      aria-label="Feed modları"
      data-testid="smart-feed-mode-nav"
    >
      <div
        className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-black/60 p-1 backdrop-blur-md border border-white/10 shadow-lg scrollbar-none"
        role="tablist"
      >
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all select-none whitespace-nowrap',
              mode === m ? 'bg-white text-black shadow-sm' : 'text-white/70 hover:text-white'
            )}
            aria-current={mode === m ? 'page' : undefined}
            aria-label={FEED_MODE_LABELS[m]}
            role="tab"
          >
            {FEED_MODE_LABELS[m]}
          </button>
        ))}
      </div>
    </nav>
  )
}
