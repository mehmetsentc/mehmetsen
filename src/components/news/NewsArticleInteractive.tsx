'use client'

import { useEffect, useState } from 'react'
import { postService } from '@/services/postService'
import { LikeButton } from '@/components/post/LikeButton'
import { SaveButton } from '@/components/post/SaveButton'
import { ShareButton } from '@/components/post/ShareButton'
import { PostComments } from '@/components/post/PostComments'
import { SuggestedNewsRail } from '@/components/post/SuggestedNewsRail'
import { useLike } from '@/hooks/useLike'
import { useSave } from '@/hooks/useSave'
import { formatCount } from '@/lib/postUtils'
import { parseArticleContent } from '@/lib/articleBodyUtils'
import type { Post } from '@/types/post'

interface NewsArticleInteractiveProps {
  post: Post
}

/** Client-only actions loaded after server article HTML (likes, comments, related). */
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
    void postService
      .getSuggestedNews(post.id, { categoryId: post.categoryId ?? 'gundem', limit: 10 })
      .then(setSuggested)
      .catch(() => {})
    void postService
      .getNewsTimeline(undefined, { feedSource: 'nahaber' })
      .then((result) => {
        setLatest(result.posts.filter((item) => item.id !== post.id).slice(0, 8))
      })
      .catch(() => {})
  }, [post.id, post.categoryId])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 sm:px-0">
      <div className="-mt-4 overflow-hidden rounded-none border border-t-0 border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] sm:rounded-b-2xl sm:border-t">
        <div className="px-4 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-2 border-t border-[rgb(var(--color-border))] pt-5">
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
        </div>
      </div>

      {suggested.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-black text-[rgb(var(--color-text))]">
            İlgili Haberler
          </h2>
          <SuggestedNewsRail posts={suggested.slice(0, 6)} preferSlugLinks />
        </section>
      )}

      {suggested.length > 6 && (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-black text-[rgb(var(--color-text))]">
            Benzer Haberler
          </h2>
          <SuggestedNewsRail posts={suggested.slice(6, 12)} preferSlugLinks />
        </section>
      )}

      {latest.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-black text-[rgb(var(--color-text))]">
            Son Haberler
          </h2>
          <SuggestedNewsRail posts={latest} preferSlugLinks />
        </section>
      )}
    </div>
  )
}
