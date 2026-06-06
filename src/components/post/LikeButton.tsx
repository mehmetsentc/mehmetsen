'use client'

import { Heart } from 'lucide-react'
import { formatCount } from '@/lib/postUtils'
import { cn } from '@/lib/utils'

interface LikeButtonProps {
  liked: boolean
  count: number
  onToggle: () => void
  loading?: boolean
  variant?: 'default' | 'overlay'
}

export function LikeButton({
  liked,
  count,
  onToggle,
  loading = false,
  variant = 'default',
}: LikeButtonProps) {
  const isOverlay = variant === 'overlay'

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      aria-label={liked ? 'Beğeniyi kaldır' : 'Beğen'}
      className={cn(
        'flex flex-col items-center gap-1 transition-transform active:scale-90 disabled:opacity-60',
        isOverlay ? 'text-white' : 'text-gray-500 hover:text-red-500'
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-sm transition-colors',
          isOverlay ? 'bg-black/30' : 'bg-gray-100',
          liked && 'text-red-500'
        )}
      >
        <Heart className={cn('h-6 w-6', liked && 'fill-current')} />
      </span>
      <span className={cn('text-xs font-semibold', isOverlay ? 'text-white drop-shadow' : '')}>
        {formatCount(count)}
      </span>
    </button>
  )
}
