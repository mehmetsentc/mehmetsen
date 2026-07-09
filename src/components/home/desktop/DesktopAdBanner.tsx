'use client'

import { cn } from '@/lib/utils'

interface DesktopAdBannerProps {
  slot: string
  size?: 'leaderboard' | 'large'
  className?: string
}

export function DesktopAdBanner({ slot, size = 'leaderboard', className }: DesktopAdBannerProps) {
  const height = size === 'large' ? 'min-h-[250px]' : 'min-h-[90px]'
  const label = size === 'large' ? '970 × 250' : '970 × 90'

  return (
    <aside
      className={cn('desktop-ad-banner', className)}
      data-ad-slot={slot}
      aria-label="Reklam alanı"
    >
      <p className="mb-1 text-right text-[10px] font-medium uppercase tracking-widest text-[rgb(var(--color-muted))]">
        Reklam
      </p>
      <div
        className={cn(
          'flex items-center justify-center border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/60',
          height
        )}
      >
        <span className="text-xs text-[rgb(var(--color-muted))]">{label}</span>
      </div>
    </aside>
  )
}
