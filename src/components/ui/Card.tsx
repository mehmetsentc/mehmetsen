'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Card — NaHaber 2026
 * Atomic Card primitive. Eski `.surface-card` global class'ının yerini
 * kademeli olarak alacak — yeni componentler buradan beslenir.
 *
 * Subcomponentler: Card.Header, Card.Body, Card.Footer, Card.Title, Card.Desc
 */
const cardVariants = cva(
  [
    'group/card relative isolate overflow-hidden',
    'transition-all duration-base ease-out-soft',
  ],
  {
    variants: {
      surface: {
        plain:    'bg-bg-card',
        subtle:   'bg-bg-subtle',
        elevated: 'bg-bg-card shadow-md',
        glass:    'bg-bg-card/70 backdrop-blur-xl',
        inverse:  'bg-text-primary text-bg-base',
      },
      bordered: {
        true:  'border border-border',
        false: '',
      },
      radius: {
        none: 'rounded-none',
        md:   'rounded-lg',
        lg:   'rounded-xl',
        xl:   'rounded-2xl',
        '2xl': 'rounded-3xl',
      },
      hover: {
        none: '',
        lift: 'hover:-translate-y-0.5 hover:shadow-lg',
        glow: 'hover:shadow-brand',
        ring: 'hover:ring-2 hover:ring-brand-500/20',
      },
      interactive: {
        true:  'cursor-pointer',
        false: '',
      },
    },
    defaultVariants: {
      surface: 'plain',
      bordered: true,
      radius: 'xl',
      hover: 'none',
      interactive: false,
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  function Card({ className, surface, bordered, radius, hover, interactive, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          cardVariants({ surface, bordered, radius, hover, interactive }),
          className
        )}
        {...rest}
      />
    )
  }
)

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 px-5 pt-5', className)} {...rest} />
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...rest} />
}

export function CardFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-border-subtle px-5 py-4',
        className
      )}
      {...rest}
    />
  )
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'text-lg font-bold leading-snug tracking-tight text-text-primary',
        className
      )}
      {...rest}
    />
  )
}

export function CardDescription({
  className,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-sm leading-relaxed text-text-tertiary', className)}
      {...rest}
    />
  )
}
