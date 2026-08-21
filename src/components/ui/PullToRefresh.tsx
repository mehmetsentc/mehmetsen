'use client'

import { usePullToRefresh, type UsePullToRefreshOptions } from '@/hooks/usePullToRefresh'
import { RefreshCw } from 'lucide-react'

interface PullToRefreshProps extends UsePullToRefreshOptions {
  children: React.ReactNode
}

export function PullToRefresh({ children, ...opts }: PullToRefreshProps) {
  const { pulling, pullY, refreshing } = usePullToRefresh(opts)

  const indicatorVisible = pulling || refreshing
  const rotation = refreshing ? undefined : `rotate(${(pullY / 72) * 360}deg)`
  const opacity = Math.min(1, pullY / 40)

  return (
    <div className="relative z-0">
      {/* Pull indicator — keep below fixed chrome (z-[100]) / status shield (z-160) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex justify-center transition-all duration-150"
        style={{
          transform: `translateY(${indicatorVisible ? Math.min(pullY, 56) - 44 : -44}px)`,
          opacity: indicatorVisible ? (refreshing ? 1 : opacity) : 0,
        }}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--color-card))] shadow-lg ring-1 ring-[rgb(var(--color-border))]">
          <RefreshCw
            className={`h-4 w-4 text-[rgb(var(--color-brand))] ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: rotation }}
            strokeWidth={2.5}
          />
        </div>
      </div>

      {children}
    </div>
  )
}
