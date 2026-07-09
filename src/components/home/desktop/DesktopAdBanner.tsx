'use client'

import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { useAdSlot } from '@/context/AdSlotContext'
import { cn } from '@/lib/utils'
import type { AdBannerPublic } from '@/types/adBanner'

interface DesktopAdBannerProps {
  slot: string
  size?: 'leaderboard' | 'large' | 'skyscraper'
  className?: string
}

const SIZE_CONFIG = {
  leaderboard: { height: 'min-h-[90px]', label: '970 × 90' },
  large: { height: 'min-h-[250px]', label: '970 × 250' },
  skyscraper: { height: 'min-h-[600px]', label: '300 × 600' },
} as const

function AdContent({ ad, size }: { ad: AdBannerPublic; size: keyof typeof SIZE_CONFIG }) {
  const height = SIZE_CONFIG[ad.size ?? size].height

  if (ad.format === 'html' && ad.htmlContent) {
    return (
      <div
        className={cn('relative w-full overflow-hidden bg-[rgb(var(--color-surface))]', height)}
        dangerouslySetInnerHTML={{ __html: ad.htmlContent }}
      />
    )
  }

  if (ad.format === 'video' && ad.videoUrl) {
    const inner = (
      <video
        src={ad.videoUrl}
        className="h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        aria-label={ad.altText ?? 'Reklam videosu'}
      />
    )
    return (
      <div className={cn('relative w-full overflow-hidden bg-black', height)}>
        {ad.clickUrl ? (
          <a href={ad.clickUrl} target="_blank" rel="noopener noreferrer sponsored" className="block h-full w-full">
            {inner}
          </a>
        ) : (
          inner
        )}
      </div>
    )
  }

  if (ad.imageUrl) {
    const img = (
      <div className={cn('relative w-full overflow-hidden bg-[rgb(var(--color-border))]', height)}>
        <SafeNewsImage
          src={ad.imageUrl}
          alt={ad.altText ?? 'Reklam'}
          fill
          sizes="970px"
          className="object-cover"
        />
      </div>
    )
    if (ad.clickUrl) {
      return (
        <a href={ad.clickUrl} target="_blank" rel="noopener noreferrer sponsored" className="block">
          {img}
        </a>
      )
    }
    return img
  }

  return null
}

function Placeholder({ size }: { size: keyof typeof SIZE_CONFIG }) {
  const config = SIZE_CONFIG[size]
  return (
    <div
      className={cn(
        'flex items-center justify-center border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/60',
        config.height
      )}
    >
      <span className="text-xs text-[rgb(var(--color-muted))]">{config.label}</span>
    </div>
  )
}

export function DesktopAdBanner({ slot, size = 'leaderboard', className }: DesktopAdBannerProps) {
  const ad = useAdSlot(slot)
  const hasContent = ad && (ad.imageUrl || ad.videoUrl || ad.htmlContent)

  return (
    <aside
      className={cn('desktop-ad-banner', className)}
      data-ad-slot={slot}
      aria-label="Reklam alanı"
    >
      <p className="mb-1 text-right text-[10px] font-medium uppercase tracking-widest text-[rgb(var(--color-muted))]">
        Reklam
      </p>
      {hasContent ? <AdContent ad={ad} size={size} /> : <Placeholder size={size} />}
    </aside>
  )
}
