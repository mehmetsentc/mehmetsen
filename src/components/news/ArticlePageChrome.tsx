'use client'

import { DesktopScrollHeader } from '@/components/home/desktop/DesktopScrollHeader'
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
      <div className="desktop-newspaper hidden lg:block">
        <DesktopScrollHeader />
      </div>
      <ArticleStickyHeader post={post} />
    </>
  )
}
