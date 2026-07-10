'use client'

import { DesktopWebHeader } from '@/components/home/desktop/DesktopWebHeader'
import { ArticleScrollProgress } from '@/components/news/ArticleScrollProgress'
import { ArticleStickyHeader } from '@/components/news/ArticleStickyHeader'
import type { Post } from '@/types/post'

interface ArticlePageChromeProps {
  post: Post
}

/**
 * BBC-style article chrome — fixed progress bar + sticky site header (desktop)
 * and compact scroll header (mobile).
 */
export function ArticlePageChrome({ post }: ArticlePageChromeProps) {
  return (
    <>
      <ArticleScrollProgress />
      <div className="desktop-newspaper sticky top-0 z-40 hidden border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/95 backdrop-blur-md lg:block">
        <DesktopWebHeader className="mb-0" />
      </div>
      <ArticleStickyHeader post={post} />
    </>
  )
}
