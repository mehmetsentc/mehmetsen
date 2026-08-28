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

export function FeedModeNav({ mode, onChange, className }: FeedModeNavProps) {
  return (
    <nav
      className={cn(
        'absolute left-0 right-0 top-0 z-50 flex justify-center bg-gradient-to-b from-black/80 via-black/40 to-transparent px-3 pb-4 pt-safe-top',
        className
      )}
      aria-label="Feed modları"
    >
      <div className="flex gap-1 rounded-full bg-black/60 p-1 backdrop-blur-md border border-white/10 shadow-lg">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all select-none',
              mode === m ? 'bg-white text-black shadow-sm' : 'text-white/70 hover:text-white'
            )}
            aria-current={mode === m ? 'page' : undefined}
            aria-label={FEED_MODE_LABELS[m]}
          >
            {FEED_MODE_LABELS[m]}
          </button>
        ))}
      </div>
    </nav>
  )
}
