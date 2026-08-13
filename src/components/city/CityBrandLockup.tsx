'use client'

import Image from 'next/image'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { getCityLogoPath } from '@/lib/cityBrand'
import { cn } from '@/lib/utils'

type LockupTone = 'onBrand' | 'default'
type LockupSize = 'sm' | 'md'

const SIZE = {
  /** Header bars — equal height logo + wordmark (~36px), wider gap */
  sm: {
    box: 'h-9 w-9',
    px: 36,
    text: 'text-[1.35rem]',
    gap: 'gap-4',
  },
  /** Sidebar */
  md: {
    box: 'h-8 w-8',
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
        className={cn(s.box, 'shrink-0 rounded-md object-contain')}
        priority={priority}
      />
      <span
        className={cn(
          'flex min-w-0 items-center truncate font-black leading-none tracking-tight',
          s.box,
          s.text
        )}
      >
        <span className={onBrand ? 'text-white' : 'text-[rgb(var(--color-text))]'}>
          {cityName}
        </span>
        <span className="ml-1.5 text-[#E50914]">NaHaber</span>
      </span>
    </span>
  )
}
