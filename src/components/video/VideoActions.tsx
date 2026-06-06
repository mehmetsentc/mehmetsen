'use client'

import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { LikeButton } from '@/components/post/LikeButton'
import { SaveButton } from '@/components/post/SaveButton'
import { ShareButton } from '@/components/post/ShareButton'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { formatCount } from '@/lib/postUtils'
import { ROUTES } from '@/constants/routes'
import type { VideoFeedItem } from '@/hooks/useVideoFeed'

interface VideoActionsProps {
  video: VideoFeedItem
  onCommentClick: () => void
  onLikeChange?: (liked: boolean, count: number) => void
  onSaveChange?: (saved: boolean, count: number) => void
}

export function VideoActions({
  video,
  onCommentClick,
  onLikeChange,
  onSaveChange,
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
    <div className="absolute bottom-24 right-3 z-20 flex flex-col items-center gap-4 sm:bottom-28 sm:right-4">
      <Link
        href={ROUTES.PROFILE(video.authorUsername)}
        className="mb-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-blue-100 text-sm font-bold text-blue-600 shadow-lg"
      >
        {video.authorPhotoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.authorPhotoURL}
            alt={video.authorDisplayName}
            className="h-full w-full object-cover"
          />
        ) : (
          video.authorDisplayName[0]?.toUpperCase()
        )}
      </Link>

      <LikeButton
        liked={liked}
        count={likesCount}
        onToggle={handleLike}
        loading={likeLoading}
        variant="overlay"
      />

      <button
        type="button"
        onClick={onCommentClick}
        aria-label="Yorumlar"
        className="flex flex-col items-center gap-1 text-white transition-transform active:scale-90"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
          <MessageCircle className="h-6 w-6" />
        </span>
        <span className="text-xs font-semibold drop-shadow">
          {formatCount(video.commentsCount)}
        </span>
      </button>

      <ShareButton postId={video.id} title={video.title} variant="overlay" />

      <SaveButton
        saved={saved}
        count={savesCount}
        onToggle={handleSave}
        loading={saveLoading}
        variant="overlay"
      />
    </div>
  )
}
