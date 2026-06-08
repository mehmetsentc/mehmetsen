'use client'

import Link from 'next/link'
import { MapPin, Hash } from 'lucide-react'
import type { Post } from '@/types/post'
import { ROUTES } from '@/constants/routes'
import { formatTagLabel } from '@/lib/tags'
import { cityCategoryId } from '@/lib/location'

interface PostMetaProps {
  post: Post
  className?: string
}

export function PostMeta({ post, className = '' }: PostMetaProps) {
  const hasTags = post.tags.length > 0
  const hasCity = Boolean(post.city || post.citySlug)

  if (!hasTags && !hasCity) return null

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {hasCity && post.citySlug && (
        <Link
          href={`${ROUTES.FEED}?category=${encodeURIComponent(cityCategoryId(post.citySlug))}`}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900"
        >
          <MapPin className="h-3 w-3" />
          {post.city ?? post.citySlug}
        </Link>
      )}
      {hasTags &&
        post.tags.map((tag) => (
          <Link
            key={tag}
            href={`${ROUTES.SEARCH}?q=${encodeURIComponent(tag)}`}
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            <Hash className="h-3 w-3" />
            {formatTagLabel(tag).slice(1)}
          </Link>
        ))}
    </div>
  )
}
