import { cn } from '@/lib/utils'
import type { ElementType, HTMLAttributes, ReactNode } from 'react'

export interface SiteContainerProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode
  className?: string
  as?: ElementType
  /** Optional inner width variant (canonical 1280px / max-w-7xl is default) */
  variant?: 'canonical' | 'prose' | 'wide'
}

/**
 * NaHaber Canonical Page Width Container (SiteContainer)
 *
 * Canonical public outer shell reference: max-w-7xl (1280px / --layout-content-newspaper)
 * Centered horizontally (mx-auto) with standard responsive padding.
 */
export function SiteContainer({
  children,
  className,
  as: Component = 'div',
  variant = 'canonical',
  ...rest
}: SiteContainerProps) {
  return (
    <Component
      className={cn(
        'w-full mx-auto',
        variant === 'canonical' && 'max-w-7xl px-4 sm:px-6 lg:px-8',
        variant === 'prose' && 'max-w-3xl px-4 sm:px-6',
        variant === 'wide' && 'max-w-[1440px] px-4 sm:px-6 lg:px-8',
        className
      )}
      {...rest}
    >
      {children}
    </Component>
  )
}
