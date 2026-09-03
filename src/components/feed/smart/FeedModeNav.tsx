'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { FEED_MODE_LABELS } from '@/lib/feed/config'
import type { FeedMode } from '@/types/smartFeed'

interface FeedModeNavProps {
  mode: FeedMode
  onChange: (mode: FeedMode) => void
  className?: string
  /** Optional trailing control (⋯ menu) — right of mode chips */
  trailing?: ReactNode
}

const MODES: FeedMode[] = ['personal', 'following', 'breaking', 'local']

/**
 * Top mode row for immersive Smart Feed:
 * [back clearance] [mode pills] [⋯ trailing]
 */
export function FeedModeNav({ mode, onChange, className, trailing }: FeedModeNavProps) {
  return (
    <nav
      className={cn(
        'absolute left-0 right-0 top-0 z-50 flex items-center gap-2',
        // Clear GlobalBackNav on the left; room for trailing menu on the right.
        'pl-14 pr-3 pb-2',
        'pt-[max(2.75rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+0.85rem))]',
        className
      )}
      aria-label="Feed modları"
      data-testid="smart-feed-mode-nav"
      data-region="mode-nav"
    >
      <div
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-full bg-black/45 p-1 backdrop-blur-md border border-white/10 scrollbar-none"
        role="tablist"
      >
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all select-none whitespace-nowrap',
              mode === m ? 'bg-white text-black shadow-sm' : 'text-white/72 hover:text-white'
            )}
            aria-current={mode === m ? 'page' : undefined}
            aria-label={FEED_MODE_LABELS[m]}
            role="tab"
          >
            {FEED_MODE_LABELS[m]}
          </button>
        ))}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </nav>
  )
}
