'use client'

import Link from 'next/link'
import { User } from 'lucide-react'
import { getCategoryLabel } from '@/lib/newsMapper'
import { getPostPublicSource } from '@/lib/postUtils'
import { publicAuthorPath, resolvePublicAuthorIdentity } from '@/lib/seo/publicAuthorIdentity'
import type { Post } from '@/types/post'

interface ArticleAuthorBoxProps {
  post: Post
}

export function ArticleAuthorBox({ post }: ArticleAuthorBoxProps) {
  const identity = resolvePublicAuthorIdentity(post)
  const byline = identity.name
  const publicSource = getPostPublicSource(post)
  const category = getCategoryLabel(post.categoryId)
  const href = publicAuthorPath(identity)

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
        {identity.aiDisclosure ? (
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
