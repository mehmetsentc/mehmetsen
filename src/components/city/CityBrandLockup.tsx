'use client'

import Image from 'next/image'
import { getCityLogoPath } from '@/lib/cityBrand'
import { cn } from '@/lib/utils'

type LockupTone = 'onBrand' | 'default'
type LockupSize = 'sm' | 'md' | 'xl'

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
  /** Newspaper masthead — type size comes from .nl-masthead__title */
  xl: {
    logo: 'h-12 w-12 sm:h-14 sm:w-14',
    textH: 'h-auto',
    px: 56,
    text: '',
    gap: 'gap-3 sm:gap-4',
  },
} as const

interface CityBrandLockupProps {
  cityName: string
  provinceSlug: string
  /** onBrand = --header-onbrand (navy=white, newspaper paper=ink); default = body text */
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

  if (!logoSrc || size === 'xl') {
    return (
      <span
        className={cn(
          'inline-flex min-w-0 max-w-full items-center font-black leading-none tracking-tight',
          s.textH,
          s.text,
          className
        )}
      >
        <span
          className={cn(
            'min-w-0 truncate',
            onBrand ? 'text-[rgb(var(--header-onbrand))]' : 'text-[rgb(var(--color-text))]'
          )}
        >
          {cityName}
        </span>
        <span className="ml-1 shrink-0 whitespace-nowrap text-[rgb(var(--wordmark-haber))] sm:ml-1.5">
          NaHaber
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
            onBrand ? 'text-[rgb(var(--header-onbrand))]' : 'text-[rgb(var(--color-text))]'
          )}
        >
          {cityName}
        </span>
        <span className="ml-1 shrink-0 whitespace-nowrap text-[rgb(var(--wordmark-haber))] sm:ml-1.5">
          NaHaber
        </span>
      </span>
    </span>
  )
}
