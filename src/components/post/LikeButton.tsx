'use client'

import { Heart } from 'lucide-react'
import { formatCount } from '@/lib/postUtils'
import { cn } from '@/lib/utils'

interface LikeButtonProps {
  liked: boolean
  count: number
  onToggle: () => void
  loading?: boolean
  variant?: 'default' | 'overlay' | 'reels' | 'inline'
}

export function LikeButton({
  liked,
  count,
  onToggle,
  loading = false,
  variant = 'default',
}: LikeButtonProps) {
  const safeCount = Math.max(0, count)
  const isOverlay = variant === 'overlay'
  const isReels = variant === 'reels'
  const isInline = variant === 'inline'

  if (isInline) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={loading}
        aria-label={liked ? 'Beğeniyi kaldır' : 'Beğen'}
        className={cn(
          'timeline-action disabled:opacity-60',
          liked && 'text-red-600 dark:text-red-400'
        )}
      >
        <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
        <span>{formatCount(safeCount)}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      disabled={loading}
      aria-label={liked ? 'Beğeniyi kaldır' : 'Beğen'}
      data-testid="smart-feed-like"
      className={cn(
        'flex flex-col items-center gap-1.5 transition-transform active:scale-90 disabled:opacity-60',
        isReels || isOverlay
          ? 'text-white'
          : 'text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400'
      )}
    >
      {isReels ? (
        <Heart
          className={cn(
            'h-7 w-7 transition-all duration-150',
            liked ? 'fill-rose-500 text-rose-500 scale-110' : 'text-white'
          )}
        />
      ) : (
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-colors sm:h-12 sm:w-12',
            isOverlay ? 'bg-black/35' : 'bg-gray-100 dark:bg-gray-800',
            liked ? '!text-rose-500 dark:!text-rose-400' : isOverlay ? 'text-white' : 'text-gray-500'
          )}
        >
          <Heart
            className={cn(
              'h-6 w-6 transition-transform duration-150',
              liked ? '!fill-rose-500 !text-rose-500 scale-110' : isOverlay ? 'text-white' : undefined
            )}
          />
        </span>
      )}
      <span
        className={cn(
          'text-[11px] font-bold tabular-nums sm:text-xs',
          liked && (isOverlay || isReels) ? 'text-rose-400 drop-shadow' : null,
          !liked && (isOverlay || isReels)
            ? 'text-white drop-shadow'
            : !liked
              ? 'text-gray-600 dark:text-gray-400'
              : 'text-rose-500'
        )}
      >
        {formatCount(safeCount)}
      </span>
    </button>
  )
}
