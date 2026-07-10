'use client'

import { format, isValid } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Radio } from 'lucide-react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import type { LiveBlogUpdate, Post } from '@/types/post'

interface LiveBlogViewProps {
  post: Post
  updates?: LiveBlogUpdate[]
}

function formatUpdateTime(iso: string): string {
  const date = new Date(iso)
  return isValid(date) ? format(date, 'HH:mm', { locale: tr }) : ''
}

export function LiveBlogView({ post, updates = [] }: LiveBlogViewProps) {
  const isLive =
    post.isLiveBlog === true || post.categoryId === 'son-dakika'

  const timeline: LiveBlogUpdate[] =
    updates.length > 0
      ? updates
      : [
          {
            id: 'initial',
            content: post.spot || post.summary || post.content?.slice(0, 500) || post.title,
            timestamp: post.publishedAt ?? post.createdAt,
            author: post.authorDisplayName,
          },
        ]

  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-10 sm:px-0">
      <nav className="mb-4 text-sm text-[rgb(var(--color-muted))]">
        <Link href={ROUTES.FEED} className="hover:text-[rgb(var(--color-text))]">
          Ana Sayfa
        </Link>
        <span className="mx-2">/</span>
        <Link href={ROUTES.CATEGORY('son-dakika')} className="hover:text-[rgb(var(--color-text))]">
          Canlı
        </Link>
      </nav>

      <header className="mb-8 border-b border-[rgb(var(--color-border))] pb-6">
        <div className="mb-3 flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
              <Radio className="h-3 w-3 animate-pulse" aria-hidden />
              CANLI
            </span>
          ) : null}
          <span className="text-xs font-semibold text-[rgb(var(--color-muted))]">
            {getCategoryLabel(post.categoryId)}
          </span>
        </div>
        <h1 className="font-serif text-3xl font-bold leading-tight text-[rgb(var(--color-text))] lg:text-4xl">
          {post.title}
        </h1>
      </header>

      <ol className="relative space-y-0 border-l-2 border-[rgb(var(--color-border))] pl-6" aria-label="Canlı güncellemeler">
        {timeline.map((update, index) => (
          <li key={update.id} className="relative pb-8 last:pb-0">
            <span
              className="absolute -left-[calc(0.75rem+1px)] top-1.5 h-3 w-3 rounded-full border-2 border-[rgb(var(--color-brand))] bg-[rgb(var(--color-card))]"
              aria-hidden
            />
            <time
              className="text-xs font-bold tabular-nums text-[rgb(var(--color-brand))]"
              dateTime={update.timestamp}
            >
              {formatUpdateTime(update.timestamp)}
              {index === 0 && isLive ? (
                <span className="ml-2 text-red-600">· Son</span>
              ) : null}
            </time>
            {update.author ? (
              <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">{update.author}</p>
            ) : null}
            <p className="mt-2 text-base leading-relaxed text-[rgb(var(--color-text))] whitespace-pre-wrap">
              {update.content}
            </p>
          </li>
        ))}
      </ol>
    </article>
  )
}
