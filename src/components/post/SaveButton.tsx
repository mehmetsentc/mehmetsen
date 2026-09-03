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
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      disabled={loading}
      aria-label={saved ? 'Kayıttan kaldır' : 'Kaydet'}
      data-testid="smart-feed-save"
      className={cn(
        'flex flex-col items-center gap-1 transition-transform active:scale-90 disabled:opacity-60',
        isReels || isOverlay
          ? 'text-white'
          : 'text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400'
      )}
    >
      {isReels ? (
        <Bookmark className={cn('h-7 w-7 transition-all duration-150', saved ? 'fill-amber-400 text-amber-400 scale-110' : 'text-white')} />
      ) : (
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-colors sm:h-12 sm:w-12',
            isOverlay ? 'bg-black/35' : 'bg-gray-100 dark:bg-gray-800',
            saved ? '!text-amber-400 dark:!text-amber-300' : isOverlay ? 'text-white' : 'text-gray-500'
          )}
        >
          <Bookmark className={cn('h-6 w-6 transition-transform duration-150', saved ? '!fill-amber-400 !text-amber-400 scale-110' : 'text-white')} />
        </span>
      )}
      {!isReels && (
        <span
          className={cn(
            'text-[11px] font-bold tabular-nums sm:text-xs',
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
