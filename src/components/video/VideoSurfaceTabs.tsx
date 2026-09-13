'use client'

import { cn } from '@/lib/utils'
import { VIDEO_FEED_MODES } from '@/lib/videoFeed/types'
import type { ReelsFeedTab } from '@/components/video/ReelsFeedTabs'

interface VideoSurfaceTabsProps {
  active: ReelsFeedTab
  onChange: (tab: ReelsFeedTab) => void
}

export function VideoSurfaceTabs({ active, onChange }: VideoSurfaceTabsProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex justify-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {VIDEO_FEED_MODES.map(({ tab, label }) => {
        const selected = active === tab
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition-colors',
              selected ? 'bg-white text-black' : 'bg-black/45 text-white/80 hover:bg-black/60 hover:text-white'
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
