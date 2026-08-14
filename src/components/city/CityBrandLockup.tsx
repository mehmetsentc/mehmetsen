'use client'

import Image from 'next/image'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { getCityLogoPath } from '@/lib/cityBrand'
import { cn } from '@/lib/utils'

type LockupTone = 'onBrand' | 'default'
type LockupSize = 'sm' | 'md'

const SIZE = {
  /**
   * Header bars — logo + wordmark.
   * Mobile: slightly smaller type + tighter gap so "… NaHaber" fits beside
   * menu/search/bell/profile without CSS truncate clipping the brand.
   */
  sm: {
    logo: 'h-8 w-8 sm:h-9 sm:w-9',
    textH: 'h-8 sm:h-9',
    px: 36,
    text: 'text-[clamp(1.05rem,4.2vw,1.35rem)]',
    gap: 'gap-2 sm:gap-3.5',
  },
  /** Sidebar */
  md: {
    logo: 'h-8 w-8',
    textH: 'h-8',
    px: 32,
    text: 'text-lg',
    gap: 'gap-3.5',
  },
} as const

interface CityBrandLockupProps {
  cityName: string
  provinceSlug: string
  /** onBrand = white city name (dark header); default = ink city name (light surfaces) */
  tone?: LockupTone
  size?: LockupSize
  className?: string
  priority?: boolean
}

/**
 * Single lockup: official logo mark + HTML wordmark.
 * Never stacks a composite lockup image with separate text (avoids ghost overlap).
 */
export function CityBrandLockup({
  cityName,
  provinceSlug,
  tone = 'onBrand',
  size = 'sm',
  className,
  priority = false,
}: CityBrandLockupProps) {
  const logoSrc = provinceSlug ? getCityLogoPath(provinceSlug) : null
  const s = SIZE[size]
  const onBrand = tone === 'onBrand'

  if (!logoSrc) {
    return (
      <span className={cn('flex min-w-0 items-center gap-2', className)}>
        <BrandWordmark
          variant={onBrand ? 'onBrand' : 'default'}
          size={size === 'sm' ? 'sm' : 'md'}
          className="font-black"
        />
        <span
          className={cn(
            'truncate text-sm font-bold',
            onBrand ? 'text-white/90' : 'text-[rgb(var(--color-text))]'
          )}
        >
          {cityName}
        </span>
      </span>
    )
  }

  return (
    <span className={cn('flex min-w-0 items-center', s.gap, className)}>
      <Image
        src={logoSrc}
        alt=""
        width={s.px}
        height={s.px}
        className={cn(s.logo, 'shrink-0 rounded-md object-contain')}
        priority={priority}
      />
      <span
        className={cn(
          // Never truncate the whole lockup — that clipped "NaHaber" → "NaHab".
          // City may ellipsize; brand wordmark stays intact (shrink-0).
          'inline-flex min-w-0 max-w-full items-center font-black leading-none tracking-tight',
          s.textH,
          s.text
        )}
      >
        <span
          className={cn(
            'min-w-0 truncate',
            onBrand ? 'text-white' : 'text-[rgb(var(--color-text))]'
          )}
        >
          {cityName}
        </span>
        <span className="ml-1 shrink-0 whitespace-nowrap text-[#E50914] sm:ml-1.5">
          NaHaber
        </span>
      </span>
    </span>
  )
}
