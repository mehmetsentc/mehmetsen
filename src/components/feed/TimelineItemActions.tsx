'use client'

import Link from 'next/link'
import { Heart, MessageCircle, Bookmark } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { formatCount } from '@/lib/postUtils'
import { ShareButton } from '@/components/post/ShareButton'
import { PostMoreButton } from '@/components/post/PostMoreMenu'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { cn } from '@/lib/utils'

interface TimelineItemActionsProps {
  postId: string
  title: string
  authorUsername: string
  likesCount: number
  commentsCount: number
  viewsCount?: number
  isVideo?: boolean
}

export function TimelineItemActions({
  postId,
  title,
  authorUsername,
  likesCount: initialLikes,
  commentsCount,
  viewsCount = 0,
  isVideo = false,
}: TimelineItemActionsProps) {
  const { liked, count: likesCount, toggle: toggleLike } = useLike({
    postId,
    initialCount: initialLikes,
  })

  const { saved, toggle: toggleSave } = useSave({
    postId,
    initialCount: 0,
  })

  return (
    <div className="timeline-actions">
      <button
        type="button"
        onClick={toggleLike}
        className={cn('timeline-action', liked && 'timeline-action-active-like')}
        aria-label="Beğen"
      >
        <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
        <span>Beğen{likesCount > 0 ? ` · ${formatCount(likesCount)}` : ''}</span>
      </button>

      <Link href={ROUTES.POST_DETAIL(postId)} className="timeline-action">
        <MessageCircle className="h-4 w-4" />
        <span>
          Yorum yap{commentsCount > 0 ? ` · ${formatCount(commentsCount)}` : ''}
        </span>
      </Link>

      <ShareButton postId={postId} title={title} variant="inline" />

      <button
        type="button"
        onClick={toggleSave}
        className={cn('timeline-action', saved && 'timeline-action-active-save')}
        aria-label="Sakla"
      >
        <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} />
        <span>Sakla</span>
      </button>

      <PostMoreButton
        post={{
          id: postId,
          title,
          authorUsername,
          isVideo,
          viewsCount,
          likesCount,
          commentsCount,
        }}
        variant="timeline"
      />
    </div>
  )
}
