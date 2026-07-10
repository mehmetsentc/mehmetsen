'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { postService } from '@/services/postService'
import { categoryPostHref, categoryPostImage } from '@/components/home/desktop/categoryPostUtils'
import type { Post } from '@/types/post'

interface ArticleRelatedGridProps {
  postId: string
  categoryId: string
}

export function ArticleRelatedGrid({ postId, categoryId }: ArticleRelatedGridProps) {
  const [related, setRelated] = useState<Post[]>([])

  useEffect(() => {
    void postService
      .getSuggestedNews(postId, { categoryId, limit: 4 })
      .then((items) => setRelated(items.slice(0, 4)))
      .catch(() => {})
  }, [postId, categoryId])

  if (related.length === 0) return null

  return (
    <section className="mt-10 border-t border-[rgb(var(--color-border))] pt-8" aria-label="İlgili haberler">
      <h2 className="mb-5 border-t-4 border-[rgb(var(--color-text))] pt-4 text-xl font-bold text-[rgb(var(--color-text))]">
        İlgili Haberler
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {related.map((item) => {
          const image = categoryPostImage(item) || FEED_FALLBACK_LOGO
          return (
            <article key={item.id} className="min-w-0">
              <Link href={categoryPostHref(item)} className="group block">
                <div className="relative mb-2 aspect-[3/2] overflow-hidden bg-[rgb(var(--color-border))]">
                  <SafeNewsImage
                    src={image}
                    alt={item.title}
                    fill
                    sizes="(max-width: 640px) 50vw, 200px"
                    className="object-cover transition-transform group-hover:scale-[1.02]"
                  />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
                  {getCategoryLabel(item.categoryId)}
                </span>
                <h3 className="mt-1 line-clamp-3 text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">
                  {item.title}
                </h3>
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}
