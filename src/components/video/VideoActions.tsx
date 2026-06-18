'use client'

import { ThumbsUp, ThumbsDown, MessageCircle, Volume2, VolumeX } from 'lucide-react'
import { LikeButton } from '@/components/post/LikeButton'
import { SaveButton } from '@/components/post/SaveButton'
import { ShareButton } from '@/components/post/ShareButton'
import { PostMoreButton } from '@/components/post/PostMoreMenu'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { useReelsAudio } from '@/store/reelsAudioContext'
import { formatCount } from '@/lib/postUtils'
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
  const { muted, toggleMuted } = useReelsAudio()

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
    <div className={cn('reels-actions', className)}>
      {/* Mute / Unmute — tüm video modlarında çalışır (native, YouTube, audio) */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleMuted() }}
        aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
        className="flex flex-col items-center gap-1.5 text-white transition-transform active:scale-90"
      >
        {muted
          ? <VolumeX className="h-7 w-7 text-white/70" />
          : <Volume2 className="h-7 w-7 text-white" />
        }
        <span className="text-xs font-bold drop-shadow">{muted ? 'Sessiz' : 'Sesli'}</span>
      </button>

      {/* Thumbs up (like) */}
      <button
        type="button"
        onClick={handleLike}
        disabled={likeLoading}
        aria-label="Beğen"
        className="flex flex-col items-center gap-1.5 text-white transition-transform active:scale-90 disabled:opacity-60"
      >
        <ThumbsUp
          className={cn('h-7 w-7 transition-colors', liked ? 'fill-white text-white' : 'text-white')}
        />
        <span className="text-xs font-bold drop-shadow">{formatCount(likesCount)}</span>
      </button>

      {/* Thumbs down (decorative — no backend dislike system yet) */}
      <button
        type="button"
        aria-label="Beğenme"
        className="flex flex-col items-center gap-1.5 text-white/80 transition-transform active:scale-90"
      >
        <ThumbsDown className="h-7 w-7" />
        <span className="text-xs font-bold drop-shadow">0</span>
      </button>

      {/* Share */}
      <ShareButton
        postId={video.id}
        title={video.title}
        variant="reels"
        onShared={() => onShareChange?.((video.sharesCount ?? 0) + 1)}
      />

      {/* Comments */}
      <button
        type="button"
        onClick={onCommentClick}
        aria-label="Yorumlar"
        className="flex flex-col items-center gap-1.5 text-white transition-transform active:scale-90"
      >
        <MessageCircle className="h-7 w-7" />
        <span className="text-xs font-bold drop-shadow">
          {formatCount(video.commentsCount)}
        </span>
      </button>

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
    </div>
  )
}
