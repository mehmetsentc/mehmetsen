'use client'

import Image from 'next/image'
import { MessageCircle } from 'lucide-react'
import { LikeButton } from '@/components/post/LikeButton'
import { SaveButton } from '@/components/post/SaveButton'
import { ShareButton } from '@/components/post/ShareButton'
import { PostMoreButton } from '@/components/post/PostMoreMenu'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { formatCount, getPrimaryVideo } from '@/lib/postUtils'
import { cn } from '@/lib/utils'
import type { VideoFeedItem } from '@/hooks/useVideoFeed'

interface VideoActionsProps {
  video: VideoFeedItem
  onCommentClick: () => void
  onLikeChange?: (liked: boolean, count: number) => void
  onSaveChange?: (saved: boolean, count: number) => void
  onShareChange?: (count: number) => void
  className?: string
}

export function VideoActions({
  video,
  onCommentClick,
  onLikeChange,
  onSaveChange,
  onShareChange,
  className,
}: VideoActionsProps) {
  const { liked, count: likesCount, toggle: toggleLike, loading: likeLoading } = useLike({
    postId: video.id,
    initialLiked: video.isLiked,
    initialCount: video.likesCount,
  })

  const { saved, count: savesCount, toggle: toggleSave, loading: saveLoading } = useSave({
    postId: video.id,
    initialSaved: video.isSaved,
    initialCount: video.savesCount,
  })

  const media = getPrimaryVideo(video)
  const thumbnail = media?.thumbnailUrl ?? video.coverImageUrl

  const handleLike = async () => {
    const prevLiked = liked
    const prevCount = likesCount
    await toggleLike()
    onLikeChange?.(!prevLiked, prevLiked ? prevCount - 1 : prevCount + 1)
  }

  const handleSave = async () => {
    const prevSaved = saved
    const prevCount = savesCount
    await toggleSave()
    onSaveChange?.(!prevSaved, prevSaved ? prevCount - 1 : prevCount + 1)
  }

  return (
    <div className={cn('reels-actions', className)}>
      <LikeButton
        liked={liked}
        count={likesCount}
        onToggle={handleLike}
        loading={likeLoading}
        variant="reels"
      />

      <button
        type="button"
        onClick={onCommentClick}
        aria-label="Yorumlar"
        className="flex flex-col items-center gap-1.5 text-white transition-transform active:scale-90"
      >
        <MessageCircle className="h-7 w-7" />
        <span className="text-xs font-semibold drop-shadow">
          {formatCount(video.commentsCount)}
        </span>
      </button>

      <ShareButton
        postId={video.id}
        title={video.title}
        variant="reels"
        onShared={() => onShareChange?.((video.sharesCount ?? 0) + 1)}
      />

      <SaveButton
        saved={saved}
        count={savesCount}
        onToggle={handleSave}
        loading={saveLoading}
        variant="reels"
      />

      <PostMoreButton
        post={{
          id: video.id,
          title: video.title,
          authorUsername: video.authorUsername,
          isVideo: true,
          viewsCount: video.viewsCount,
          likesCount,
          commentsCount: video.commentsCount,
          savesCount,
        }}
        variant="reels"
        saved={saved}
        onToggleSave={handleSave}
      />

      {thumbnail && (
        <div className="relative mt-1 h-9 w-9 overflow-hidden rounded-md border border-white/30">
          <Image src={thumbnail} alt="" fill className="object-cover" sizes="36px" />
        </div>
      )}
    </div>
  )
}
