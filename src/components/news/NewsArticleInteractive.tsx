'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { postService } from '@/services/postService'
import { LikeButton } from '@/components/post/LikeButton'
import { SaveButton } from '@/components/post/SaveButton'
import { ShareButton } from '@/components/post/ShareButton'
import { PostComments } from '@/components/post/PostComments'
import { SuggestedNewsRail } from '@/components/post/SuggestedNewsRail'
import { NextArticleCard } from '@/components/news/NextArticleCard'
import { ArticleReaderTools } from '@/components/news/ArticleReaderTools'
import { ArticleSourceBadge } from '@/components/news/ArticleSourceBadge'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { formatCount } from '@/lib/postUtils'
import { parseArticleContent } from '@/lib/articleBodyUtils'
import { NewsArticleBody, NewsArticleCard, NewsArticlePage } from '@/components/news/NewsArticlePage'
import type { Post } from '@/types/post'

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
}

export function NewsArticleInteractive({ post }: NewsArticleInteractiveProps) {
  const [suggested, setSuggested] = useState<Post[]>([])
  const [latest, setLatest] = useState<Post[]>([])
  const { leadText, bodyText } = parseArticleContent(post)

  const { liked, count: likesCount, toggle: toggleLike, loading: likeLoading } = useLike({
    postId: post.id,
    initialCount: post.likesCount,
  })

  const { saved, count: savesCount, toggle: toggleSave, loading: saveLoading } = useSave({
    postId: post.id,
    initialCount: post.savesCount,
  })

  useEffect(() => {
    postService.incrementViews(post.id).catch(() => {})

    let cancelled = false
    const loadRelated = () => {
      if (cancelled) return
      void postService
        .getSuggestedNews(post.id, { categoryId: post.categoryId ?? 'gundem', limit: 8 })
        .then((items) => {
          if (!cancelled) setSuggested(items)
        })
        .catch(() => {})
      void postService
        .getNewsTimeline(undefined, { feedSource: 'nahaber' })
        .then((result) => {
          if (!cancelled) {
            setLatest(result.posts.filter((item) => item.id !== post.id).slice(0, 8))
          }
        })
        .catch(() => {})
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(loadRelated, { timeout: 2500 })
      return () => {
        cancelled = true
        window.cancelIdleCallback(id)
      }
    }

    const t = globalThis.setTimeout(loadRelated, 1200)
    return () => {
      cancelled = true
      globalThis.clearTimeout(t)
    }
  }, [post.id, post.categoryId])

  return (
    <NewsArticlePage className="pb-10" articleId={post.id}>
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

      {(suggested[0] ?? latest[0]) && (
        <section className="news-article-rail mt-4 w-full">
          <NextArticleCard nextPost={suggested[0] ?? latest[0]} />
        </section>
      )}
    </NewsArticlePage>
  )
}
