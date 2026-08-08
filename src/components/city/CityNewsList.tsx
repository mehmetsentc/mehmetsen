'use client'

import { cn } from '@/lib/utils'

function Skeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-3 py-3 animate-pulse">
          <div className="h-20 w-28 shrink-0 rounded-lg bg-[rgb(var(--color-surface-raised))]" />
          <div className="flex flex-1 flex-col justify-center gap-2">
            <div className="h-4 w-full rounded bg-[rgb(var(--color-surface-raised))]" />
            <div className="h-4 w-3/4 rounded bg-[rgb(var(--color-surface-raised))]" />
            <div className="h-3 w-1/3 rounded bg-[rgb(var(--color-surface-raised))]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export const CityNewsList = { Skeleton }
