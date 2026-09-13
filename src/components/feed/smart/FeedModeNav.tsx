'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { FEED_MODE_LABELS } from '@/lib/feed/config'
import type { FeedMode } from '@/types/smartFeed'
import { ContextRail, contextRailChipClass } from '@/components/layout/ContextRail'

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
 *
 * Presentation matches ContextRail. Not mounted on Global Nav V2
 * (FeedV2CategoryNav already includes Sana Özel / Takip / Son Dakika / Yerel).
 */
export function FeedModeNav({ mode, onChange, className, trailing }: FeedModeNavProps) {
  return (
    <ContextRail
      ariaLabel="Feed modları"
      testId="smart-feed-mode-nav"
      className={cn(
        'absolute left-0 right-0 top-0 z-50',
        'pl-14 pr-3 pb-2',
        'pt-[max(2.75rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+0.85rem))]',
        className
      )}
      trailing={trailing}
    >
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={contextRailChipClass(mode === m)}
          aria-current={mode === m ? 'page' : undefined}
          aria-label={FEED_MODE_LABELS[m]}
          role="tab"
        >
          {FEED_MODE_LABELS[m]}
        </button>
      ))}
    </ContextRail>
  )
}
