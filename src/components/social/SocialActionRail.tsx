'use client'

import { useEffect, useRef, useState } from 'react'
import { LikeButton as BaseLikeButton } from '@/components/post/LikeButton'
import { SaveButton as BaseSaveButton } from '@/components/post/SaveButton'
import { ShareButton as BaseShareButton } from '@/components/post/ShareButton'
import { MessageCircle } from 'lucide-react'
import { formatCount } from '@/lib/postUtils'
import { cn } from '@/lib/utils'

export const FEED_REACTION_OPTIONS = [
  { id: 'LIKE', label: 'Beğen', emoji: '❤️' },
  { id: 'APPLAUSE', label: 'Alkış', emoji: '👏' },
  { id: 'IMPORTANT', label: 'Önemli', emoji: '🔥' },
  { id: 'SAD', label: 'Üzücü', emoji: '😢' },
  { id: 'ANGRY', label: 'Kızgın', emoji: '😡' },
] as const

export type FeedReactionId = (typeof FEED_REACTION_OPTIONS)[number]['id']

interface SocialActionRailProps {
  articleId: string
  slug?: string
  title: string
  summary?: string
  liked: boolean
  saved: boolean
  likeCount: number
  commentCount: number
  saveCount?: number
  reaction?: string | null
  onToggleLike: () => void
  /** Long-press reaction — additive; does not invent fake counts. */
  onReact?: (reaction: FeedReactionId) => void
  onToggleSave: () => void
  onCommentClick?: () => void
  likeLoading?: boolean
  saveLoading?: boolean
  className?: string
  /** horizontal (default) or vertical Reels-style rail */
  orientation?: 'horizontal' | 'vertical'
  'data-testid'?: string
}

export function SocialActionRail({
  articleId,
  slug,
  title,
  summary,
  liked,
  saved,
  likeCount,
  commentCount,
  saveCount = 0,
  reaction,
  onToggleLike,
  onReact,
  onToggleSave,
  onCommentClick,
  likeLoading,
  saveLoading,
  className,
  orientation = 'horizontal',
  'data-testid': dataTestId,
}: SocialActionRailProps) {
  const vertical = orientation === 'vertical'
  const [pickerOpen, setPickerOpen] = useState(false)
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [pickerOpen])

  const clearPress = () => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const activeReaction = FEED_REACTION_OPTIONS.find((r) => r.id === reaction)
  const likeEmoji = liked && activeReaction && activeReaction.id !== 'LIKE' ? activeReaction.emoji : null

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative',
        vertical
          ? 'flex flex-col items-center gap-3.5'
          : 'flex items-center justify-around gap-2 py-2',
        className
      )}
      data-orientation={orientation}
      data-testid={dataTestId}
    >
      {pickerOpen && onReact ? (
        <div
          className={cn(
            'absolute z-40 flex gap-1 rounded-full border border-white/15 bg-black/90 p-1.5 shadow-xl backdrop-blur-md',
            vertical ? 'right-full top-0 mr-2 flex-col' : 'bottom-full left-1/2 mb-2 -translate-x-1/2'
          )}
          data-testid="smart-feed-reaction-picker"
          role="listbox"
          aria-label="Tepki seç"
        >
          {FEED_REACTION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-label={opt.label}
              className="flex h-10 w-10 items-center justify-center rounded-full text-lg transition hover:bg-white/10 active:scale-95"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setPickerOpen(false)
                onReact(opt.id)
              }}
            >
              <span aria-hidden>{opt.emoji}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div
        className="relative"
        onPointerDown={(e) => {
          if (!onReact) return
          longPressed.current = false
          clearPress()
          pressTimer.current = window.setTimeout(() => {
            longPressed.current = true
            setPickerOpen(true)
          }, 420)
          e.stopPropagation()
        }}
        onPointerUp={() => {
          clearPress()
        }}
        onPointerLeave={() => {
          clearPress()
        }}
        onPointerCancel={() => {
          clearPress()
        }}
        onClick={(e) => {
          if (longPressed.current) {
            e.preventDefault()
            e.stopPropagation()
            longPressed.current = false
          }
        }}
      >
        {likeEmoji ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!longPressed.current) onToggleLike()
            }}
            disabled={likeLoading}
            aria-label="Tepkiyi kaldır"
            data-testid="smart-feed-like"
            className="flex flex-col items-center gap-1.5 text-white transition-transform active:scale-90 disabled:opacity-60"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-xl backdrop-blur-sm sm:h-12 sm:w-12">
              {likeEmoji}
            </span>
            <span className="text-[11px] font-bold tabular-nums text-white drop-shadow sm:text-xs">
              {formatCount(Math.max(0, likeCount))}
            </span>
          </button>
        ) : (
          <BaseLikeButton
            liked={liked}
            count={likeCount}
            onToggle={() => {
              if (!longPressed.current) onToggleLike()
            }}
            loading={likeLoading}
            variant="overlay"
          />
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onCommentClick?.()
        }}
        className="flex flex-col items-center gap-1 text-white transition-transform active:scale-90"
        aria-label="Yorum yap"
        data-testid="smart-feed-comment"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm sm:h-12 sm:w-12">
          <MessageCircle className="h-6 w-6" strokeWidth={2.25} />
        </span>
        <span className="text-[11px] font-bold tabular-nums text-white drop-shadow sm:text-xs">
          {formatCount(commentCount)}
        </span>
      </button>
      <BaseSaveButton
        saved={saved}
        count={saveCount}
        onToggle={onToggleSave}
        loading={saveLoading}
        variant="overlay"
      />
      <BaseShareButton postId={articleId} slug={slug} title={title} text={summary} variant="overlay" />
    </div>
  )
}

export { BaseLikeButton as LikeButton, BaseSaveButton as SaveButton, BaseShareButton as ShareButton }
