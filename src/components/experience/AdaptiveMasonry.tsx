'use client'

import { ExperienceCard } from './ExperienceCard'
import type { ExperienceSlot } from './types'
import { cn } from '@/lib/utils'

interface AdaptiveMasonryProps {
  slots: ExperienceSlot[]
  className?: string
  /** First N cards get image priority. */
  priorityCount?: number
}

/**
 * CSS columns + span-aware slots give a Pinterest-like masonry without a
 * heavy JS layout library. Column count adapts via CSS container queries /
 * media breakpoints in globals.css.
 */
export function AdaptiveMasonry({
  slots,
  className,
  priorityCount = 2,
}: AdaptiveMasonryProps) {
  return (
    <div className={cn('exp-masonry', className)} role="feed" aria-label="Haber akışı">
      {slots.map((slot) => (
        <ExperienceCard
          key={`${slot.post.id}-${slot.index}`}
          slot={slot}
          priority={slot.index < priorityCount}
        />
      ))}
    </div>
  )
}
