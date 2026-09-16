import { cn } from '@/lib/utils'

/**
 * NaHaber wordmark — logo renkleri (her yerde aynı):
 *  - Haber = brand kırmızı #E50914 (opacity / muted pink yok)
 *  - default: Na = metin rengi (light ink / dark white)
 *  - onBrand (koyu header bar): Na = beyaz
 */
export type BrandWordmarkVariant = 'default' | 'onBrand'

const SIZE_CLASS = {
  sm: 'text-[1.35rem]',
  md: 'text-[1.55rem]',
  lg: 'text-[1.85rem]',
  xl: 'text-[clamp(2.6rem,5vw,4rem)]',
} as const

/** Master brand red — follows --wordmark-haber (brand-600 on newspaper paper) */
const HABER_RED = 'text-[rgb(var(--wordmark-haber))]'

interface BrandWordmarkProps {
  variant?: BrandWordmarkVariant
  size?: keyof typeof SIZE_CLASS
  /** Masaüstü masthead için ".com" eki */
  showDotCom?: boolean
  className?: string
}

export function BrandWordmark({
  variant = 'default',
  size = 'md',
  showDotCom = false,
  className,
}: BrandWordmarkProps) {
  const onBrand = variant === 'onBrand'

  return (
    <span
      className={cn(
        'leading-none tracking-tight',
        SIZE_CLASS[size],
        className
      )}
      itemProp="name"
    >
      <span
        className={
          onBrand
            ? 'text-[rgb(var(--wordmark-na-onbrand))]'
            : 'text-[rgb(var(--wordmark-na))]'
        }
      >
        Na
      </span>
      <span className={HABER_RED}>Haber</span>
      {showDotCom ? (
        <span
          className={cn(
            'text-[0.55em] font-semibold',
            onBrand
              ? 'text-[rgb(var(--wordmark-na-onbrand))]/90'
              : 'text-[rgb(var(--color-muted))]'
          )}
        >
          .com
        </span>
      ) : null}
    </span>
  )
}
