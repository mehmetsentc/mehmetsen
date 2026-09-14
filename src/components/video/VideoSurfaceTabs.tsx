'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { VIDEO_FEED_MODES } from '@/lib/videoFeed/types'
import type { ReelsFeedTab } from '@/components/video/ReelsFeedTabs'

interface VideoSurfaceTabsProps {
  active: ReelsFeedTab
  onChange: (tab: ReelsFeedTab) => void
  placement?: 'overlay' | 'masthead'
}

export function VideoSurfaceTabs({
  active,
  onChange,
  placement = 'overlay',
}: VideoSurfaceTabsProps) {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [active])

  const masthead = placement === 'masthead'

  return (
    <div
      className={cn(
        masthead
          ? 'nl-video-tabs relative z-10 flex justify-start px-0 pb-3 pt-0'
          : 'pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]'
      )}
      data-testid="video-surface-tabs"
    >
      <div
        className={cn(
          'pointer-events-auto flex max-w-full gap-2 overflow-x-auto',
          masthead ? 'justify-start' : 'justify-center'
        )}
      >
        {VIDEO_FEED_MODES.map(({ tab, label }) => {
          const selected = active === tab
          return (
            <button
              key={tab}
              type="button"
              ref={selected ? activeRef : undefined}
              onClick={() => onChange(tab)}
              className={cn(
                'shrink-0 px-3 py-1.5 text-xs font-semibold transition-colors',
                masthead
                  ? cn(
                      'rounded-none border-b-2 uppercase tracking-[0.08em]',
                      selected
                        ? 'border-[#E50914] text-[#111]'
                        : 'border-transparent text-[#111]/50 hover:text-[#111]'
                    )
                  : cn(
                      'rounded-full backdrop-blur-sm',
                      selected
                        ? 'bg-white text-black'
                        : 'bg-black/45 text-white/80 hover:bg-black/60 hover:text-white'
                    )
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
