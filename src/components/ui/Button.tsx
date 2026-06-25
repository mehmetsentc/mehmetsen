'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Button v2 — NaHaber 2026
 * CVA tabanlı, 7 variant + 4 size + loading/iconOnly state.
 *
 * Eski API (variant: 'primary' | 'secondary' | 'danger') geriye uyumlu
 * sayılarak yeniden adlandırıldı: primary → solid, secondary → soft, danger → destructive.
 * Eski isimler de kabul edilir (lib'de map'lenir) — kademeli geçiş için.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-semibold tracking-tight select-none',
    'transition-[transform,background-color,box-shadow,color,opacity]',
    'duration-quick ease-out-soft',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.97]',
  ],
  {
    variants: {
      variant: {
        /** dolu kırmızı — birincil eylem */
        solid: [
          'bg-brand-500 text-white shadow-sm',
          'hover:bg-brand-600 hover:shadow-brand',
        ],
        /** kontur — ikincil */
        outline: [
          'border border-border bg-bg-card text-text-primary',
          'hover:border-border-strong hover:bg-bg-subtle',
        ],
        /** açık tonlu — yumuşak ikincil */
        soft: [
          'bg-brand-500/10 text-brand-600 dark:text-brand-300',
          'hover:bg-brand-500/15',
        ],
        /** kalın siyah/beyaz — Apple stil */
        inverse: [
          'bg-text-primary text-bg-base',
          'hover:opacity-90',
        ],
        /** transparan — sadece hover'da görünür */
        ghost: [
          'text-text-primary',
          'hover:bg-bg-subtle dark:hover:bg-bg-elevated',
        ],
        /** link — inline */
        link: [
          'text-text-link underline-offset-4 hover:underline',
        ],
        /** yıkıcı eylem */
        destructive: [
          'bg-danger text-danger-fg shadow-sm',
          'hover:bg-danger/90',
        ],
      },
      size: {
        sm:  'h-8 px-3 text-sm rounded-lg',
        md:  'h-10 px-4 text-sm rounded-xl',
        lg:  'h-12 px-5 text-base rounded-xl',
        xl:  'h-14 px-6 text-lg rounded-2xl',
        icon: 'h-10 w-10 rounded-full',
        'icon-sm': 'h-8 w-8 rounded-full',
      },
      fullWidth: { true: 'w-full' },
    },
    defaultVariants: {
      variant: 'solid',
      size: 'md',
    },
  }
)

/** Legacy variant mapping (eski API geriye uyumlu kalsın) */
type LegacyVariant = 'primary' | 'secondary' | 'danger'
type ButtonVariantProps = VariantProps<typeof buttonVariants>
type NewVariant = NonNullable<ButtonVariantProps['variant']>

const legacyMap: Record<LegacyVariant, NewVariant> = {
  primary: 'solid',
  secondary: 'outline',
  danger: 'destructive',
}

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size'>,
    Omit<ButtonVariantProps, 'variant'> {
  /** Yeni variant API (CVA) + legacy API ('primary' | 'secondary' | 'danger') */
  variant?: NewVariant | LegacyVariant
  /** Yükleme spinner'ı göster + disabled */
  loading?: boolean
  /** Solda ikon */
  leftIcon?: React.ReactNode
  /** Sağda ikon */
  rightIcon?: React.ReactNode
  /** Slot pattern — başka bir element üzerine variant uygula */
  asChild?: boolean
}

function isLegacy(v: string): v is LegacyVariant {
  return v === 'primary' || v === 'secondary' || v === 'danger'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant,
      size,
      fullWidth,
      loading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...rest
    },
    ref
  ) {
    // Eski API: 'primary' | 'secondary' | 'danger' verilirse map'le
    const mappedVariant: NewVariant | undefined =
      typeof variant === 'string' && isLegacy(variant)
        ? legacyMap[variant]
        : (variant as NewVariant | undefined)

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          buttonVariants({ variant: mappedVariant, size, fullWidth }),
          className
        )}
        {...rest}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}
        {children}
        {!loading && rightIcon ? (
          <span className="shrink-0">{rightIcon}</span>
        ) : null}
      </button>
    )
  }
)

export { buttonVariants }
