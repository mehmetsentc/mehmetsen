'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { LikeButton } from '@/components/post/LikeButton'
import { SaveButton } from '@/components/post/SaveButton'
import { ShareButton } from '@/components/post/ShareButton'
import { PostComments } from '@/components/post/PostComments'
import { SuggestedNewsRail } from '@/components/post/SuggestedNewsRail'
import { NextArticleCard } from '@/components/news/NextArticleCard'
import { NewsletterPrompt } from '@/components/newsletter/NewsletterPrompt'
import { ArticleReaderTools } from '@/components/news/ArticleReaderTools'
import { ArticleSourceBadge } from '@/components/news/ArticleSourceBadge'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { useNewsViewIncrement } from '@/hooks/useNewsViewIncrement'
import { formatCount } from '@/lib/postUtils'
import { parseArticleContent } from '@/lib/articleBodyUtils'
import { NewsArticleBody, NewsArticleCard, NewsArticlePage } from '@/components/news/NewsArticlePage'
import type { Post } from '@/types/post'
import type { CategoryFeedPage } from '@/services/newsService.server'

/**
 * COST REDUCTION: getSuggestedNews() + getNewsTimeline() direkt Firestore okuması kaldırıldı.
 * Her makale sayfasında ~34 Firestore oku tetikliyordu (5000 görüntüleme/gün → ~170k oku/gün).
 * Yerine /api/feed/category (5 dk ISR cache) kullanılıyor — Firestore'a asla direkt gitmiyor.
 */
function newsItemToPost(item: CategoryFeedPage['items'][number]): Post {
  return {
    id: item.id,
    slug: item.slug ?? item.id,
    title: item.title ?? '',
    coverImageUrl: item.imageUrl ?? null,
    categoryId: item.category ?? 'gundem',
    publishedAt: item.publishedAt ?? null,
    summary: item.description ?? '',
    description: item.description ?? '',
    postType: 'news',
    status: 'published',
    type: 'news',
    content: '',
    author: '',
    authorId: '',
    createdAt: null,
    updatedAt: null,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    viewsCount: 0,
    isBreaking: item.breaking ?? false,
    featured: false,
  } as unknown as Post
}

const ArticleTOC = dynamic(
  () => import('@/components/news/ArticleTOC').then((m) => m.ArticleTOC),
  { ssr: false }
)
const ArticleReactions = dynamic(
  () => import('@/components/news/ArticleReactions').then((m) => m.ArticleReactions),
  { ssr: false }
)

interface NewsArticleInteractiveProps {
  post: Post
  /** When set (city subdomain), related rail is scoped to this province slug. */
  citySlug?: string | null
}

export function NewsArticleInteractive({ post, citySlug }: NewsArticleInteractiveProps) {
  const [suggested, setSuggested] = useState<Post[]>([])
  const { leadText, bodyText } = parseArticleContent(post)

  const { liked, count: likesCount, toggle: toggleLike, loading: likeLoading } = useLike({
    postId: post.id,
    initialCount: post.likesCount,
  })

  const { saved, count: savesCount, toggle: toggleSave, loading: saveLoading } = useSave({
    postId: post.id,
    initialCount: post.savesCount,
  })

  // Lightweight viewsCount only (session-debounced). Full analytics stays paused.
  useNewsViewIncrement(post.id)

  useEffect(() => {
    let cancelled = false
    const loadRelated = async () => {
      if (cancelled) return
      try {
        const categoryId = post.categoryId ?? 'gundem'
        const res = citySlug
          ? await fetch(`/api/city/news?category=${encodeURIComponent(categoryId)}&limit=12`)
          : await fetch(`/api/feed/category?id=${encodeURIComponent(categoryId)}&limit=12`)
        if (!res.ok || cancelled) return
        const data = (await res.json()) as CategoryFeedPage | { items: CategoryFeedPage['items'] }
        const items = 'items' in data ? data.items : []
        const filtered = items
          .filter((i) => i.id !== post.id)
          .slice(0, 8)
          .map(newsItemToPost)
        if (!cancelled) setSuggested(filtered)
      } catch {
        // non-blocking
      }
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => void loadRelated(), { timeout: 2500 })
      return () => {
        cancelled = true
        window.cancelIdleCallback(id)
      }
    }

    const t = globalThis.setTimeout(() => void loadRelated(), 1200)
    return () => {
      cancelled = true
      globalThis.clearTimeout(t)
    }
  }, [post.id, post.categoryId, citySlug])

  return (
    <NewsArticlePage className="max-lg:pb-[var(--article-reader-clearance)] lg:pb-10" articleId={post.id}>
      <ArticleTOC postId={post.id} />
      <ArticleReaderTools post={post} />

      <NewsArticleCard continued className="-mt-4">
        <NewsArticleBody>
          <div className="-mt-2 mb-3 flex w-full flex-wrap items-center gap-2">
            <ArticleSourceBadge post={post} />
          </div>

          <ArticleReactions postId={post.id} />

          <div className="mt-5 flex w-full flex-wrap items-center gap-2 border-t border-[rgb(var(--color-border))] pt-5">
            <LikeButton
              liked={liked}
              count={likesCount}
              onToggle={toggleLike}
              loading={likeLoading}
              variant="inline"
            />
            <ShareButton
              postId={post.id}
              slug={post.slug}
              title={post.title}
              text={leadText || bodyText.slice(0, 200)}
              variant="inline"
            />
            <SaveButton
              saved={saved}
              count={savesCount}
              onToggle={toggleSave}
              loading={saveLoading}
              variant="inline"
            />
            <span className="ml-auto text-sm text-[rgb(var(--color-muted))]">
              {formatCount(Math.max(0, likesCount))} beğeni
            </span>
          </div>

          <PostComments postId={post.id} initialCount={post.commentsCount} />
        </NewsArticleBody>
      </NewsArticleCard>

      {suggested.length > 0 ? (
        <section className="news-article-rail mt-8 w-full" aria-label="Daha fazla haber">
          <h2 className="mb-4 text-lg font-black text-[rgb(var(--color-text))]">
            Daha fazla haber
          </h2>
          <SuggestedNewsRail posts={suggested.slice(0, 8)} preferSlugLinks hideHeader />
        </section>
      ) : null}

      {suggested[0] && (
        <section className="news-article-rail mt-4 w-full">
          <NextArticleCard nextPost={suggested[0]} />
        </section>
      )}

      <NewsletterPrompt />
    </NewsArticlePage>
  )
}
