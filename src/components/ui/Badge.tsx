'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Badge v2 — NaHaber 2026
 * Eski API (variant: 'default' | 'breaking' | 'category' | 'trending') ile uyumlu;
 * yeni kategori accent variantları (siyaset/ekonomi/spor/...) eklendi.
 */
const badgeVariants = cva(
  [
    'inline-flex items-center gap-1 whitespace-nowrap',
    'font-semibold tracking-tight',
  ],
  {
    variants: {
      variant: {
        /* ── Legacy ─────────────────────────────────────────────── */
        default:  'bg-bg-subtle text-text-secondary',
        breaking: 'bg-brand-500 text-white shadow-brand',
        category: 'bg-info/10 text-info',
        trending: 'bg-cat-magazin/10 text-cat-magazin',
        /* ── New ────────────────────────────────────────────────── */
        solid:    'bg-text-primary text-bg-base',
        outline:  'border border-border bg-transparent text-text-primary',
        success:  'bg-success/10 text-success',
        warning:  'bg-warning/15 text-[color:rgb(var(--warning-fg))] dark:text-warning',
        danger:   'bg-danger/10 text-danger',
        /* ── Category accents ───────────────────────────────────── */
        gundem:     'bg-cat-gundem/10 text-cat-gundem',
        sondakika:  'bg-cat-sondakika text-white shadow-brand',
        siyaset:    'bg-cat-siyaset/10 text-cat-siyaset',
        ekonomi:    'bg-cat-ekonomi/10 text-cat-ekonomi',
        spor:       'bg-cat-spor/10 text-cat-spor',
        dunya:      'bg-cat-dunya/10 text-cat-dunya',
        teknoloji:  'bg-cat-teknoloji/10 text-cat-teknoloji',
        saglik:     'bg-cat-saglik/10 text-cat-saglik',
        kultur:     'bg-cat-kultur/10 text-cat-kultur',
        yerel:      'bg-cat-yerel/10 text-cat-yerel',
        yasam:      'bg-cat-yasam/10 text-cat-yasam',
        video:      'bg-cat-video/10 text-cat-video',
        egitim:     'bg-cat-egitim/10 text-cat-egitim',
        magazin:    'bg-cat-magazin/10 text-cat-magazin',
        hava:       'bg-cat-hava/10 text-cat-hava',
      },
      size: {
        sm: 'rounded-md px-1.5 py-0.5 text-2xs',
        md: 'rounded-md px-2 py-0.5 text-xs',
        lg: 'rounded-lg px-2.5 py-1 text-sm',
      },
      uppercase: { true: 'uppercase tracking-widest' },
      pulse: { true: 'animate-pulse-brand' },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, uppercase, pulse, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size, uppercase, pulse }), className)}
      {...rest}
    />
  )
}

export { badgeVariants }
