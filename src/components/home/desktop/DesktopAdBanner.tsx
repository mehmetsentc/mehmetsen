'use client'

import { cn } from '@/lib/utils'

interface DesktopAdBannerProps {
  slot: string
  size?: 'leaderboard' | 'large' | 'skyscraper'
  className?: string
}

export function DesktopAdBanner({ slot, size = 'leaderboard', className }: DesktopAdBannerProps) {
  const config = {
    leaderboard: { height: 'min-h-[90px]', label: '970 × 90' },
    large: { height: 'min-h-[250px]', label: '970 × 250' },
    skyscraper: { height: 'min-h-[600px]', label: '300 × 600' },
  }[size]

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
          config.height
        )}
      >
        <span className="text-xs text-[rgb(var(--color-muted))]">{config.label}</span>
      </div>
    </aside>
  )
}
