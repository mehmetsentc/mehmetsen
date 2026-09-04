'use client'

import { cn } from '@/lib/utils'

interface FullscreenNewsCardSkeletonProps {
  className?: string
}

/** Bottom-aligned news chrome — matches FullscreenNewsCard (no mid floating card). */
export function FullscreenNewsCardSkeleton({ className }: FullscreenNewsCardSkeletonProps) {
  return (
    <article
      className={cn(
        'relative flex h-[100dvh] w-full snap-start snap-always flex-col overflow-hidden bg-black select-none',
        className
      )}
      aria-label="Yükleniyor..."
      aria-busy="true"
      data-feed-skeleton="true"
      data-testid="smart-feed-skeleton"
    >
      <div className="absolute inset-0">
        <div className="h-full w-full animate-pulse bg-gradient-to-br from-neutral-800 via-neutral-950 to-neutral-900" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" aria-hidden />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-end p-4 pb-6 pt-[5.75rem] md:mx-auto md:w-full md:max-w-lg">
        <div className="space-y-3 pr-14">
          <div className="h-5 w-20 rounded-md bg-white/20 animate-pulse" />
          <div className="space-y-2">
            <div className="h-7 w-full rounded-md bg-white/25 animate-pulse" />
            <div className="h-7 w-4/5 rounded-md bg-white/20 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <div className="h-4 w-full rounded bg-white/15 animate-pulse" />
            <div className="h-4 w-full rounded bg-white/12 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-white/10 animate-pulse" />
          </div>
          <div className="mt-1 h-11 w-full rounded-full bg-white/25 animate-pulse" />
          <div className="flex items-center gap-2 pt-1">
            <div className="h-8 w-8 shrink-0 rounded-full bg-white/20 animate-pulse" />
            <div className="h-3.5 w-28 rounded bg-white/20 animate-pulse" />
            <div className="ml-auto h-8 w-24 rounded-full bg-white/15 animate-pulse" />
          </div>
        </div>
      </div>
    </article>
  )
}
