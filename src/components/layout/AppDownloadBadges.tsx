import React from 'react'
import { cn } from '@/lib/utils'

const APP_STORE_URL = 'https://apps.apple.com/us/app/nahaber/id6784465855'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.nahaber.app'

type BadgeVariant = 'boxed' | 'minimal'

function AppStoreBadge({ variant }: { variant: BadgeVariant }) {
  const isMinimal = variant === 'minimal'
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="NaHaber uygulamasını App Store'dan indir"
      className={cn(
        'inline-flex items-center gap-2 transition-colors',
        isMinimal
          ? 'gap-1.5 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
          : 'rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3.5 py-2 hover:bg-[rgb(var(--color-border))]'
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className={cn(
          'shrink-0 fill-current',
          isMinimal ? 'h-4 w-4 text-current' : 'h-5 w-5 text-[rgb(var(--color-text))]'
        )}
        aria-hidden
      >
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
      {isMinimal ? (
        <span className="text-[12px] font-medium tracking-tight">App Store</span>
      ) : (
        <span className="leading-tight">
          <span className="block text-[9px] font-normal text-[rgb(var(--color-muted))]">İndir</span>
          <span className="block text-[12px] font-semibold text-[rgb(var(--color-text))]">App Store</span>
        </span>
      )}
    </a>
  )
}

function PlayStoreBadge({ variant }: { variant: BadgeVariant }) {
  const isMinimal = variant === 'minimal'
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="NaHaber uygulamasını Google Play'den indir"
      className={cn(
        'inline-flex items-center gap-2 transition-colors',
        isMinimal
          ? 'gap-1.5 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
          : 'rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3.5 py-2 hover:bg-[rgb(var(--color-border))]'
      )}
    >
      <svg viewBox="0 0 24 24" className={cn('shrink-0', isMinimal ? 'h-4 w-4' : 'h-5 w-5')} aria-hidden>
        <path d="M3.18 23.76c.3.17.64.24.99.19l13.12-7.58-2.83-2.83-11.28 10.22z" fill="#EA4335" />
        <path d="M22.13 10.53l-3.02-1.75-3.17 3.17 3.17 3.17 3.05-1.76c.87-.5.87-1.83-.03-2.83z" fill="#FBBC05" />
        <path d="M3.18.24C2.83.19 2.49.26 2.19.43L14.08 12.32l3.17-3.17L3.18.24z" fill="#4285F4" />
        <path d="M2.19.43C1.64.76 1.27 1.37 1.27 2.12v19.76c0 .75.37 1.36.92 1.69l11.89-11.25L2.19.43z" fill="#34A853" />
      </svg>
      {isMinimal ? (
        <span className="text-[12px] font-medium tracking-tight">Google Play</span>
      ) : (
        <span className="leading-tight">
          <span className="block text-[9px] font-normal text-[rgb(var(--color-muted))]">İndir</span>
          <span className="block text-[12px] font-semibold text-[rgb(var(--color-text))]">Google Play</span>
        </span>
      )}
    </a>
  )
}

export function AppDownloadBadges({
  className,
  variant = 'boxed',
}: {
  className?: string
  /** boxed = bordered store buttons; minimal = quiet text+icon links (city footers) */
  variant?: BadgeVariant
}) {
  return (
    <div
      className={cn(
        variant === 'minimal' ? 'flex flex-wrap items-center gap-x-5 gap-y-2' : 'flex flex-wrap gap-3',
        className
      )}
    >
      <AppStoreBadge variant={variant} />
      <PlayStoreBadge variant={variant} />
    </div>
  )
}
