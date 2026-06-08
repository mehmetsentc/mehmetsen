'use client'

import { Bookmark } from 'lucide-react'
import { formatCount } from '@/lib/postUtils'
import { cn } from '@/lib/utils'

interface SaveButtonProps {
  saved: boolean
  count: number
  onToggle: () => void
  loading?: boolean
  variant?: 'default' | 'overlay' | 'reels' | 'inline'
}

export function SaveButton({
  saved,
  count,
  onToggle,
  loading = false,
  variant = 'overlay',
}: SaveButtonProps) {
  const isOverlay = variant === 'overlay'
  const isReels = variant === 'reels'
  const isInline = variant === 'inline'

  if (isInline) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={loading}
        aria-label={saved ? 'Kayıttan kaldır' : 'Kaydet'}
        className={cn(
          'timeline-action disabled:opacity-60',
          saved && 'text-blue-600 dark:text-blue-400'
        )}
      >
        <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} />
        <span>{formatCount(count)}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      aria-label={saved ? 'Kayıttan kaldır' : 'Kaydet'}
      className={cn(
        'flex flex-col items-center gap-1.5 transition-transform active:scale-90 disabled:opacity-60',
        isReels || isOverlay
          ? 'text-white'
          : 'text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400'
      )}
    >
      {isReels ? (
        <Bookmark className={cn('h-7 w-7', saved && 'fill-white')} />
      ) : (
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-sm transition-colors',
            isOverlay ? 'bg-black/30' : 'bg-gray-100 dark:bg-gray-800',
            saved && 'text-yellow-500 dark:text-yellow-400'
          )}
        >
          <Bookmark className={cn('h-6 w-6', saved && 'fill-current')} />
        </span>
      )}
      {!isReels && (
        <span
          className={cn(
            'text-xs font-semibold',
            isOverlay
              ? 'text-white drop-shadow'
              : 'text-gray-600 dark:text-gray-400'
          )}
        >
          {formatCount(count)}
        </span>
      )}
    </button>
  )
}
