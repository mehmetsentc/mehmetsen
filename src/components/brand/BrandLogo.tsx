import Image from 'next/image'
import { cn } from '@/lib/utils'

/** App-open / route-loading mark (rounded N icon on dark). */
export const BRAND_BOOT_MARK_SRC = '/brand/nahaber-boot-mark.png'

/** Wordmark / lockup used in headers and about surfaces. */
export const BRAND_LOGO_SRC = '/brand/nahaber-logo.png'

const SIZE_MAP = {
  sm: { width: 28, height: 28, className: 'h-7 w-7' },
  md: { width: 32, height: 32, className: 'h-8 w-8' },
  lg: { width: 48, height: 48, className: 'h-12 w-12' },
} as const

const BOOT_SIZE_MAP = {
  sm: { width: 56, height: 56, className: 'h-14 w-14' },
  md: { width: 88, height: 88, className: 'h-[5.5rem] w-[5.5rem]' },
  lg: { width: 112, height: 112, className: 'h-28 w-28' },
} as const

interface BrandLogoProps {
  size?: keyof typeof SIZE_MAP
  className?: string
  priority?: boolean
}

export function BrandLogo({ size = 'md', className, priority }: BrandLogoProps) {
  const { width, height, className: sizeClass } = SIZE_MAP[size]

  return (
    <Image
      src={BRAND_LOGO_SRC}
      alt="NaHaber"
      width={width}
      height={height}
      priority={priority}
      className={cn('shrink-0 object-contain', sizeClass, className)}
    />
  )
}

interface BrandBootMarkProps {
  size?: keyof typeof BOOT_SIZE_MAP
  className?: string
  priority?: boolean
}

/** Animated boot mark for loading / app-open surfaces. */
export function BrandBootMark({ size = 'md', className, priority = true }: BrandBootMarkProps) {
  const { width, height, className: sizeClass } = BOOT_SIZE_MAP[size]

  return (
    <span className={cn('brand-boot-mark relative inline-flex', className)}>
      <span className="brand-boot-mark__halo absolute inset-[-18%] rounded-[28%] bg-[rgb(225_29_46_/_0.28)] blur-xl" aria-hidden />
      <Image
        src={BRAND_BOOT_MARK_SRC}
        alt="NaHaber"
        width={width}
        height={height}
        priority={priority}
        className={cn(
          'brand-boot-mark__logo relative shrink-0 rounded-[22%] object-contain drop-shadow-[0_14px_36px_rgb(0_0_0_/_0.55)]',
          sizeClass
        )}
      />
    </span>
  )
}
