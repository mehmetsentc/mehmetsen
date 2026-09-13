'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { VIDEO_FEED_MODES } from '@/lib/videoFeed/types'
import type { ReelsFeedTab } from '@/components/video/ReelsFeedTabs'

interface VideoSurfaceTabsProps {
  active: ReelsFeedTab
  onChange: (tab: ReelsFeedTab) => void
}

export function VideoSurfaceTabs({ active, onChange }: VideoSurfaceTabsProps) {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [active])

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
      data-testid="video-surface-tabs"
    >
      <div className="pointer-events-auto flex max-w-full justify-center gap-2 overflow-x-auto">
        {VIDEO_FEED_MODES.map(({ tab, label }) => {
          const selected = active === tab
          return (
            <button
              key={tab}
              type="button"
              ref={selected ? activeRef : undefined}
              onClick={() => onChange(tab)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition-colors',
                selected ? 'bg-white text-black' : 'bg-black/45 text-white/80 hover:bg-black/60 hover:text-white'
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
