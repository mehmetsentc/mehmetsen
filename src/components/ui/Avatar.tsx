'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface AvatarProps {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
  xl: 'h-24 w-24 text-3xl sm:h-28 sm:w-28',
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initial = name?.[0]?.toUpperCase() ?? '?'
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = Boolean(src && failedSrc === src)

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(src)}
        className={cn('rounded-full object-cover', sizes[size], className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-[rgb(var(--color-brand))]/10 font-semibold text-[rgb(var(--color-brand))]',
        sizes[size],
        className
      )}
    >
      {initial}
    </div>
  )
}
