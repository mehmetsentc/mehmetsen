'use client'

import Link from 'next/link'
import { User } from 'lucide-react'
import { getCategoryLabel } from '@/lib/newsMapper'
import { getArticleBylineName, getPostPublicSource } from '@/lib/postUtils'
import { resolveFeedEditorByline } from '@/lib/feed/resolveFeedEditorByline'
import { ROUTES } from '@/constants/routes'
import type { Post } from '@/types/post'

interface ArticleAuthorBoxProps {
  post: Post
}

function resolvePublicAuthorSlug(post: Post): string | null {
  const editor = resolveFeedEditorByline({
    authorName: post.authorDisplayName,
    authorId: post.authorId,
    aiEditorId: post.aiEditorId,
    citySlug: post.citySlug,
    categoryId: post.categoryId,
    publisherName: post.source,
  })
  if (editor?.slug) return editor.slug
  const username = post.authorUsername?.trim()
  if (!username || username === 'nahaber') return null
  if (/\s/.test(username) || username.length < 2 || username.length > 40) return null
  if (!post.authorId || post.authorId === 'nahaber') return null
  return username
}

export function ArticleAuthorBox({ post }: ArticleAuthorBoxProps) {
  const byline = getArticleBylineName(post)
  const publicSource = getPostPublicSource(post)
  const category = getCategoryLabel(post.categoryId)
  const authorSlug = resolvePublicAuthorSlug(post)
  const href = authorSlug ? ROUTES.AUTHOR(authorSlug) : null

  const avatar = (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]">
      {post.authorPhotoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.authorPhotoURL}
          alt={byline}
          width={48}
          height={48}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <User className="h-6 w-6" aria-hidden />
      )}
    </div>
  )

  return (
    <aside
      className="my-6 flex items-start gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4 sm:my-8 sm:gap-4 sm:p-5"
      aria-label="Yazar bilgisi"
    >
      {href ? (
        <Link href={href} className="shrink-0" aria-label={`${byline} yazar sayfası`}>
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
          {post.articleFormat === 'column'
            ? 'Köşe Yazısı'
            : post.articleFormat === 'analysis'
              ? 'Analiz'
              : category}
        </p>
        {href ? (
          <Link
            href={href}
            className="mt-0.5 block text-base font-bold text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))]"
          >
            {byline}
          </Link>
        ) : (
          <p className="mt-0.5 text-base font-bold text-[rgb(var(--color-text))]">{byline}</p>
        )}
        {post.aiEditorId || post.authorIsAI ? (
          <p className="mt-1 text-xs font-semibold text-[rgb(var(--color-brand))]">
            NaHaber AI Editörü
          </p>
        ) : null}
        {publicSource ? (
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">Kaynak: {publicSource}</p>
        ) : null}
        {href ? (
          <p className="mt-2 text-xs font-semibold text-[rgb(var(--color-brand))]">
            Tüm yazıları gör →
          </p>
        ) : null}
      </div>
    </aside>
  )
}
