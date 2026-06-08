'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { Heart, MessageCircle, Bookmark, Share2, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { formatCount } from '@/lib/postUtils'
import { ShareButton } from '@/components/post/ShareButton'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { getPrimaryVideo } from '@/lib/postUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { shouldShowBreakingBadge } from '@/lib/newsBreaking'
import { buildFeedTeaser } from '@/lib/newsContentCleanup'

interface NewsCardProps {
  post: Post
}

export function NewsCard({ post }: NewsCardProps) {
  const timeAgo = post.publishedAt
    ? formatDistanceToNow(new Date(post.publishedAt), { addSuffix: true, locale: tr })
    : ''

  const cover =
    post.coverImageUrl ||
    getPrimaryVideo(post)?.thumbnailUrl ||
    null

  const { liked, count: likesCount, toggle: toggleLike } = useLike({
    postId: post.id,
    initialCount: post.likesCount,
  })

  const { saved, toggle: toggleSave } = useSave({
    postId: post.id,
    initialCount: post.savesCount,
  })

  const showBreaking = shouldShowBreakingBadge(post)
  const feedTeaser =
    post.feedTeaser ?? buildFeedTeaser(post.title, post.summary, post.content)

  return (
    <article className="news-card">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--color-border))] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={post.authorDisplayName} src={post.authorPhotoURL} size="sm" />
          <div className="min-w-0">
            <Link
              href={ROUTES.PROFILE(post.authorUsername)}
              className="truncate text-sm font-semibold text-[rgb(var(--color-text))] hover:text-blue-600 dark:hover:text-blue-400"
            >
              {post.authorDisplayName}
            </Link>
            <div className="flex items-center gap-1.5 text-xs text-[rgb(var(--color-muted))]">
              <span>@{post.authorUsername}</span>
              {timeAgo && (
                <>
                  <span>·</span>
                  <Clock className="h-3 w-3" />
                  <span>{timeAgo}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <Badge
          variant={
            showBreaking
              ? 'breaking'
              : post.editorType === 'trend'
                ? 'trending'
                : post.categoryId
                  ? 'category'
                  : 'breaking'
          }
        >
          {showBreaking
            ? 'Son Dakika'
            : post.editorType === 'trend'
              ? 'Trending'
              : getCategoryLabel(post.categoryId)}
        </Badge>
      </div>

      <Link href={ROUTES.POST_DETAIL(post.id)} className="group block">
        {cover ? (
          <div className="feed-media-card feed-media-card-photo">
            <div className="feed-media-card-media">
              <SafeNewsImage
                src={cover}
                alt={post.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                sizes="(max-width: 768px) 100vw, 600px"
              />
              <span className="feed-media-card-badge">{getCategoryLabel(post.categoryId)}</span>
              <div className="feed-media-card-shade" aria-hidden />
              <div className="feed-media-card-overlay">
                <h2 className="feed-media-headline">{post.title}</h2>
              </div>
            </div>
          </div>
        ) : (
          <div className="feed-media-card feed-media-card-fallback">
            <div className="feed-media-card-overlay">
              <h2 className="feed-media-headline">{post.title}</h2>
            </div>
          </div>
        )}

        <div className="space-y-2 px-4 py-3">
          {feedTeaser && (
            <p className="timeline-summary">{feedTeaser}</p>
          )}
          <p className="text-xs font-medium text-[rgb(var(--color-muted))]">Kaynak: {post.authorDisplayName}</p>
        </div>
      </Link>

      <div className="flex items-center justify-between border-t border-[rgb(var(--color-border))] px-4 py-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleLike}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
              liked ? 'text-red-500' : 'text-gray-500 hover:bg-gray-50 hover:text-red-500'
            }`}
          >
            <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
            <span>{formatCount(likesCount)}</span>
          </button>
          <Link
            href={ROUTES.POST_DETAIL(post.id)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-blue-600"
          >
            <MessageCircle className="h-4 w-4" />
            <span>{formatCount(post.commentsCount)}</span>
          </Link>
          <ShareButton postId={post.id} title={post.title} variant="inline" />
        </div>
        <button
          type="button"
          onClick={toggleSave}
          className={`rounded-lg p-2 transition-colors ${
            saved ? 'text-blue-600' : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
          }`}
        >
          <Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
        </button>
      </div>
    </article>
  )
}
