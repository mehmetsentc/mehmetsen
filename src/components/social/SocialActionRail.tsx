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
  onToggleLike: () => void
  onToggleSave: () => void
  onCommentClick?: () => void
  likeLoading?: boolean
  saveLoading?: boolean
  className?: string
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
  onToggleLike,
  onToggleSave,
  onCommentClick,
  likeLoading,
  saveLoading,
  className,
}: SocialActionRailProps) {
  return (
    <div className={cn('flex items-center justify-around gap-2 py-2', className)}>
      <BaseLikeButton liked={liked} count={likeCount} onToggle={onToggleLike} loading={likeLoading} variant="overlay" />
      <button
        type="button"
        onClick={onCommentClick}
        className="flex flex-col items-center gap-1.5 text-white transition-transform active:scale-90"
        aria-label="Yorum yap"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
          <MessageCircle className="h-6 w-6" />
        </span>
        <span className="text-xs font-semibold text-white drop-shadow">
          {formatCount(commentCount)}
        </span>
      </button>
      <BaseSaveButton saved={saved} count={0} onToggle={onToggleSave} loading={saveLoading} variant="overlay" />
      <BaseShareButton postId={articleId} slug={slug} title={title} text={summary} variant="overlay" />
    </div>
  )
}

export { BaseLikeButton as LikeButton, BaseSaveButton as SaveButton, BaseShareButton as ShareButton }
