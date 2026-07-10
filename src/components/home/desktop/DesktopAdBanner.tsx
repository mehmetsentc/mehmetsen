'use client'

import { useAdSlot } from '@/context/AdSlotContext'
import { cn } from '@/lib/utils'
import type { AdBannerPublic } from '@/types/adBanner'

interface DesktopAdBannerProps {
  slot: string
  size?: 'leaderboard' | 'large' | 'skyscraper'
  className?: string
}

/** IAB standart oranları — genişlik %100, yükseklik orantılı ölçeklenir */
const SIZE_CONFIG = {
  leaderboard: { aspectRatio: 970 / 90, maxWidth: undefined, label: '970 × 90' },
  large: { aspectRatio: 970 / 250, maxWidth: undefined, label: '970 × 250' },
  skyscraper: { aspectRatio: 300 / 600, maxWidth: '300px', label: '300 × 600' },
} as const

type SizeKey = keyof typeof SIZE_CONFIG

function AdFrame({
  sizeKey,
  children,
  className,
}: {
  sizeKey: SizeKey
  children: React.ReactNode
  className?: string
}) {
  const config = SIZE_CONFIG[sizeKey]
  return (
    <div
      className={cn(
        'relative mx-auto w-full min-w-0 max-w-full overflow-hidden rounded-sm border border-[rgb(var(--color-border))]/40 bg-[rgb(var(--color-surface))]',
        className
      )}
      style={{
        aspectRatio: String(config.aspectRatio),
        maxWidth: config.maxWidth ?? '100%',
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-0">
        {children}
      </div>
    </div>
  )
}

function AdBannerImage({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      decoding="async"
      className="block h-full w-full max-h-full max-w-full object-contain object-center"
      style={{ objectFit: 'contain', objectPosition: 'center' }}
    />
  )
}

function AdContent({ ad, size }: { ad: AdBannerPublic; size: SizeKey }) {
  const sizeKey = (ad.size ?? size) as SizeKey

  if (ad.format === 'html' && ad.htmlContent) {
    return (
      <AdFrame sizeKey={sizeKey}>
        <div
          className="flex h-full w-full max-w-full items-center justify-center overflow-hidden [&_*]:max-h-full [&_*]:max-w-full [&_iframe]:max-h-full [&_iframe]:max-w-full [&_img]:mx-auto [&_img]:block [&_img]:h-auto [&_img]:max-h-full [&_img]:max-w-full [&_img]:object-contain"
          dangerouslySetInnerHTML={{ __html: ad.htmlContent }}
        />
      </AdFrame>
    )
  }

  if (ad.format === 'video' && ad.videoUrl) {
    const inner = (
      <video
        src={ad.videoUrl}
        className="max-h-full max-w-full object-contain object-center"
        autoPlay
        muted
        loop
        playsInline
        aria-label={ad.altText ?? 'Reklam videosu'}
      />
    )
    return (
      <AdFrame sizeKey={sizeKey} className="bg-black">
        {ad.clickUrl ? (
          <a
            href={ad.clickUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="flex h-full w-full max-w-full items-center justify-center overflow-hidden"
          >
            {inner}
          </a>
        ) : (
          inner
        )}
      </AdFrame>
    )
  }

  if (ad.imageUrl) {
    const img = (
      <AdFrame sizeKey={sizeKey}>
        <AdBannerImage src={ad.imageUrl} alt={ad.altText ?? 'Reklam'} />
      </AdFrame>
    )
    if (ad.clickUrl) {
      return (
        <a
          href={ad.clickUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="block w-full max-w-full overflow-hidden"
        >
          {img}
        </a>
      )
    }
    return img
  }

  return null
}

function Placeholder({ size }: { size: SizeKey }) {
  const config = SIZE_CONFIG[size]
  return (
    <AdFrame sizeKey={size}>
      <div className="flex h-full w-full items-center justify-center border border-dashed border-[rgb(var(--color-border))]">
        <span className="text-xs text-[rgb(var(--color-muted))]">{config.label}</span>
      </div>
    </AdFrame>
  )
}

export function DesktopAdBanner({ slot, size = 'leaderboard', className }: DesktopAdBannerProps) {
  const ad = useAdSlot(slot)
  const hasContent = ad && (ad.imageUrl || ad.videoUrl || ad.htmlContent)

  return (
    <aside
      className={cn(
        'desktop-ad-banner mx-auto w-full min-w-0 max-w-full overflow-hidden',
        className
      )}
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
