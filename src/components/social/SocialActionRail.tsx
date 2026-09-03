'use client'

import { LikeButton as BaseLikeButton } from '@/components/post/LikeButton'
import { SaveButton as BaseSaveButton } from '@/components/post/SaveButton'
import { ShareButton as BaseShareButton } from '@/components/post/ShareButton'
import { MessageCircle } from 'lucide-react'
import { formatCount } from '@/lib/postUtils'
import { cn } from '@/lib/utils'

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
  onToggleLike: () => void
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
  onToggleLike,
  onToggleSave,
  onCommentClick,
  likeLoading,
  saveLoading,
  className,
  orientation = 'horizontal',
  'data-testid': dataTestId,
}: SocialActionRailProps) {
  const vertical = orientation === 'vertical'

  return (
    <div
      className={cn(
        vertical
          ? 'flex flex-col items-center gap-3.5'
          : 'flex items-center justify-around gap-2 py-2',
        className
      )}
      data-orientation={orientation}
      data-testid={dataTestId}
    >
      <BaseLikeButton liked={liked} count={likeCount} onToggle={onToggleLike} loading={likeLoading} variant="overlay" />
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
