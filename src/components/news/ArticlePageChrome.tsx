'use client'

import { ArticleScrollProgress } from '@/components/news/ArticleScrollProgress'
import { ArticleStickyHeader } from '@/components/news/ArticleStickyHeader'
import type { Post } from '@/types/post'

interface ArticlePageChromeProps {
  post: Post
}

/**
 * BBC-style article chrome — fixed progress bar + sticky site header (mobile)
 */
export function ArticlePageChrome({ post }: ArticlePageChromeProps) {
  return (
    <>
      <ArticleScrollProgress />
      <ArticleStickyHeader post={post} />
    </>
  )
}
