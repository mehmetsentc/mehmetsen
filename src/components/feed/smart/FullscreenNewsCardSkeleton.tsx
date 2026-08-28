'use client'

import { cn } from '@/lib/utils'

interface FullscreenNewsCardSkeletonProps {
  className?: string
}

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
    >
      {/* Background with subtle shimmer gradient & scrim */}
      <div className="absolute inset-0">
        <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/30" aria-hidden />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-between p-4 pt-16 pb-6 md:mx-auto md:max-w-lg md:w-full">
        {/* Publisher header skeleton */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm">
            <div className="h-6 w-6 rounded-full bg-white/20 animate-pulse shrink-0" />
            <div className="h-3.5 w-24 rounded bg-white/20 animate-pulse" />
            <span className="text-white/40 text-xs select-none">·</span>
            <div className="h-3 w-10 rounded bg-white/20 animate-pulse shrink-0" />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <div className="h-7 w-16 rounded-full bg-white/20 animate-pulse" />
            <div className="h-7 w-7 rounded-full bg-white/20 animate-pulse" />
          </div>
        </div>

        {/* Bottom content skeleton */}
        <div className="space-y-3">
          {/* Tag / badge pill */}
          <div className="flex items-center gap-2">
            <div className="h-5 w-24 rounded-full bg-white/15 animate-pulse" />
          </div>

          {/* Headline skeleton (2 lines) */}
          <div className="space-y-2">
            <div className="h-7 w-full rounded-md bg-white/20 animate-pulse" />
            <div className="h-7 w-4/5 rounded-md bg-white/20 animate-pulse" />
          </div>

          {/* Summary skeleton (2 lines) */}
          <div className="space-y-1.5">
            <div className="h-4 w-full rounded bg-white/10 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-white/10 animate-pulse" />
          </div>

          {/* Read article button skeleton */}
          <div className="mt-2 h-11 w-full rounded-full bg-white/20 animate-pulse" />

          {/* Social action rail skeleton */}
          <div className="flex items-center justify-around gap-2 py-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="h-12 w-12 rounded-full bg-black/30 backdrop-blur-sm border border-white/5 animate-pulse" />
                <div className="h-2.5 w-6 rounded bg-white/15 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}
