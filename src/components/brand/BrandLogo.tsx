import Image from 'next/image'
import { cn } from '@/lib/utils'

export const BRAND_LOGO_SRC = '/brand/nahaber-logo.png'

const SIZE_MAP = {
  sm: { width: 28, height: 28, className: 'h-7 w-7' },
  md: { width: 32, height: 32, className: 'h-8 w-8' },
  lg: { width: 48, height: 48, className: 'h-12 w-12' },
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
