'use client'

import { User } from 'lucide-react'
import { getCategoryLabel } from '@/lib/newsMapper'
import { getArticleBylineName } from '@/lib/postUtils'
import type { Post } from '@/types/post'

interface ArticleAuthorBoxProps {
  post: Post
}

export function ArticleAuthorBox({ post }: ArticleAuthorBoxProps) {
  const byline = getArticleBylineName(post)
  const category = getCategoryLabel(post.categoryId)

  return (
    <aside
      className="my-8 flex items-start gap-4 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-5"
      aria-label="Yazar bilgisi"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]">
        <User className="h-6 w-6" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
          {category}
        </p>
        <p className="mt-0.5 text-base font-bold text-[rgb(var(--color-text))]">{byline}</p>
        {post.source ? (
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">Kaynak: {post.source}</p>
        ) : null}
      </div>
    </aside>
  )
}
