'use client'

import { cn } from '@/lib/utils'
import {
  getEventTypeTagLabel,
  getEventTypeTags,
  getEventTypeTagStyle,
  isEventFree,
} from '@/lib/eventUtils'
import type { NaEvent } from '@/types/event'

interface CityEventBadgesProps {
  event: NaEvent
  /** Show type tags below the free badge (list view). */
  layout?: 'overlay' | 'inline'
  showFree?: boolean
  className?: string
}

export function CityEventFreeBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide',
        'bg-emerald-500 text-white shadow-sm',
        className
      )}
    >
      Ücretsiz
    </span>
  )
}

export function CityEventBadges({
  event,
  layout = 'overlay',
  showFree = true,
  className,
}: CityEventBadgesProps) {
  const free = showFree && isEventFree(event)
  const typeTags = getEventTypeTags(event.tags).slice(0, 2)

  if (!free && typeTags.length === 0) return null

  if (layout === 'overlay') {
    return (
      <div className={cn('absolute bottom-2 left-2 right-2 flex flex-wrap gap-1', className)}>
        {free && <CityEventFreeBadge />}
        {typeTags.map((tag) => (
          <span
            key={tag}
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
              getEventTypeTagStyle(tag)
            )}
          >
            {getEventTypeTagLabel(tag)}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {free && <CityEventFreeBadge />}
      {typeTags.map((tag) => (
        <span
          key={tag}
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
            getEventTypeTagStyle(tag)
          )}
        >
          {getEventTypeTagLabel(tag)}
        </span>
      ))}
    </div>
  )
}
