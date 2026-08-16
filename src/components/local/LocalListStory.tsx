'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { formatNewsDateBbc } from '@/components/home/desktop/formatNewsDate'
import {
  categoryPostHref,
  categoryPostImage,
  categoryPostSummary,
} from '@/components/home/desktop/categoryPostUtils'
import type { TimelinePost } from '@/types/post'

function postIso(post: TimelinePost): string {
  const raw = post.publishedAt ?? post.createdAt
  return typeof raw === 'number' ? new Date(raw).toISOString() : String(raw)
}

/** Yatay satır — başlık + özet okunabilirliği yüksek */
export function LocalListStory({ post }: { post: TimelinePost }) {
  const href = categoryPostHref(post)
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)
  const time = formatNewsDateBbc(postIso(post))

  return (
    <Link href={href} className="local-list__row group">
      <div className="local-list__media shrink-0">
        <SafeNewsImage
          src={image}
          alt={post.title}
          fill
          sizes="112px"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <div className="min-w-0">
        <h3 className="local-list__title">{post.title}</h3>
        {summary ? <p className="local-list__summary">{summary}</p> : null}
        {time ? <p className="local-list__meta">{time}</p> : null}
      </div>
    </Link>
  )
}
