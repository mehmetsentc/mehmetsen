import Link from 'next/link'
import Image from 'next/image'
import { Heart, MessageCircle, Bookmark, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  const timeAgo = post.publishedAt
    ? formatDistanceToNow(new Date(post.publishedAt), { addSuffix: true, locale: tr })
    : ''

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Author */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
          {post.authorDisplayName?.[0]?.toUpperCase() ?? post.authorUsername[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">
            {post.authorDisplayName ?? post.authorUsername}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
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
        {post.categoryId && (
          <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
            {post.categoryId}
          </span>
        )}
      </div>

      {/* Content */}
      <Link href={ROUTES.POST_DETAIL(post.id)} className="group block">
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="mb-1.5 line-clamp-2 text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
              {post.title}
            </h2>
            {post.summary && (
              <p className="line-clamp-2 text-sm text-gray-500">{post.summary}</p>
            )}
          </div>
          {post.coverImageUrl && (
            <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl">
              <Image
                src={post.coverImageUrl}
                alt={post.title}
                fill
                className="object-cover"
                sizes="112px"
              />
            </div>
          )}
        </div>
      </Link>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-5 border-t border-gray-50 pt-3">
        <button className="flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-red-500">
          <Heart className="h-4 w-4" />
          <span>{post.likesCount}</span>
        </button>
        <Link
          href={ROUTES.POST_DETAIL(post.id)}
          className="flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-blue-500"
        >
          <MessageCircle className="h-4 w-4" />
          <span>{post.commentsCount}</span>
        </Link>
        <button className="ml-auto flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-blue-500">
          <Bookmark className="h-4 w-4" />
          <span>{post.savesCount}</span>
        </button>
      </div>
    </article>
  )
}
