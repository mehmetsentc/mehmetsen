'use client'

import { ThumbsUp, ThumbsDown, MessageCircle, Volume2, VolumeX } from 'lucide-react'
import { SaveButton } from '@/components/post/SaveButton'
import { ShareButton } from '@/components/post/ShareButton'
import { PostMoreButton } from '@/components/post/PostMoreMenu'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { useReelsAudio } from '@/store/reelsAudioContext'
import { formatCount } from '@/lib/postUtils'
import { cn } from '@/lib/utils'
import { useVideoArticleSocial } from '@/hooks/useVideoArticleSocial'
import type { VideoFeedSurface } from '@/lib/videoFeed/types'
import type { VideoFeedItem } from '@/hooks/useVideoFeed'

interface VideoActionsProps {
  video: VideoFeedItem
  onCommentClick: () => void
  onLikeChange?: (liked: boolean, count: number) => void
  onSaveChange?: (saved: boolean, count: number) => void
  onShareChange?: (count: number) => void
  className?: string
  surface?: VideoFeedSurface
}

export function VideoActions({
  video,
  onCommentClick,
  onLikeChange,
  onSaveChange,
  onShareChange,
  className,
  surface = 'reels',
}: VideoActionsProps) {
  const { effectiveMuted, toggleMuted } = useReelsAudio()
  const articleSocial = useVideoArticleSocial({
    articleId: video.id,
    initialLiked: video.isLiked,
    initialLikeCount: video.likesCount,
    initialSaved: video.isSaved,
    initialSaveCount: video.savesCount,
    enabled: surface === 'video',
  })

  const { liked, count: likesCount, toggle: toggleLike, loading: likeLoading } = useLike({
    postId: video.id,
    initialLiked: video.isLiked,
    initialCount: video.likesCount,
    enabled: surface !== 'video',
  })

  const { saved, count: savesCount, toggle: toggleSave, loading: saveLoading } = useSave({
    postId: video.id,
    initialSaved: video.isSaved,
    initialCount: video.savesCount,
    enabled: surface !== 'video',
  })

  const displayLiked = surface === 'video' ? articleSocial.liked : liked
  const displayLikes = surface === 'video' ? articleSocial.likeCount : likesCount
  const displaySaved = surface === 'video' ? articleSocial.saved : saved
  const displaySaves = surface === 'video' ? articleSocial.saveCount : savesCount
  const displayLikeLoading = surface === 'video' ? articleSocial.likeLoading : likeLoading
  const displaySaveLoading = surface === 'video' ? articleSocial.saveLoading : saveLoading

  const handleLike = async () => {
    const prevLiked = displayLiked
    const prevCount = displayLikes
    if (surface === 'video') await articleSocial.toggleLike()
    else await toggleLike()
    onLikeChange?.(!prevLiked, prevLiked ? prevCount - 1 : prevCount + 1)
  }

  const handleSave = async () => {
    const prevSaved = displaySaved
    const prevCount = displaySaves
    if (surface === 'video') await articleSocial.toggleSave()
    else await toggleSave()
    onSaveChange?.(!prevSaved, prevSaved ? prevCount - 1 : prevCount + 1)
  }

  return (
    <div className={cn('reels-actions', className)}>
      {/* Mute / Unmute — tüm video modlarında çalışır (native, YouTube, audio) */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleMuted() }}
        aria-label={effectiveMuted ? 'Sesi aç' : 'Sesi kapat'}
        className="flex flex-col items-center gap-1.5 text-white transition-transform active:scale-90"
      >
        {effectiveMuted
          ? <VolumeX className="h-7 w-7 text-white/70" />
          : <Volume2 className="h-7 w-7 text-white" />
        }
        <span className="text-xs font-bold drop-shadow">{effectiveMuted ? 'Sessiz' : 'Sesli'}</span>
      </button>

      {/* Thumbs up (like) */}
      <button
        type="button"
        onClick={handleLike}
        disabled={displayLikeLoading}
        aria-label="Beğen"
        className="flex flex-col items-center gap-1.5 text-white transition-transform active:scale-90 disabled:opacity-60"
      >
        <ThumbsUp
          className={cn('h-7 w-7 transition-colors', displayLiked ? 'fill-white text-white' : 'text-white')}
        />
        <span className="text-xs font-bold drop-shadow">{formatCount(displayLikes)}</span>
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
        slug={surface === 'video' ? video.slug : undefined}
        title={video.title}
        text={surface === 'video' ? video.summary : undefined}
        variant="reels"
        onShared={() => {
          if (surface === 'video') void articleSocial.recordShare()
          onShareChange?.((video.sharesCount ?? 0) + 1)
        }}
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
        saved={displaySaved}
        count={displaySaves}
        onToggle={handleSave}
        loading={displaySaveLoading}
        variant="reels"
      />

      <PostMoreButton
        post={{
          id: video.id,
          title: video.title,
          authorUsername: video.authorUsername,
          isVideo: true,
          viewsCount: video.viewsCount,
          likesCount: displayLikes,
          commentsCount: video.commentsCount,
          savesCount: displaySaves,
        }}
        variant="reels"
        saved={displaySaved}
        onToggleSave={handleSave}
      />
    </div>
  )
}
