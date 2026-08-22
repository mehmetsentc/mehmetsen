'use client'

import { ArticleScrollProgress } from '@/components/news/ArticleScrollProgress'
import { ArticleStickyHeader } from '@/components/news/ArticleStickyHeader'
import type { Post } from '@/types/post'

interface ArticlePageChromeProps {
  post: Post
}

/**
 * BBC-style article chrome — fixed progress bar + dedicated mobile header.
 */
export function ArticlePageChrome({ post }: ArticlePageChromeProps) {
  return (
    <>
      <ArticleScrollProgress />
      <ArticleStickyHeader post={post} />
      {/* Reserve space under fixed mobile header (safe-area aware). */}
      <div className="article-mobile-header-spacer lg:hidden" aria-hidden />
    </>
  )
}
