'use client'

import { ArticleScrollProgress } from '@/components/news/ArticleScrollProgress'

/**
 * Article reading chrome — scroll progress only.
 * Site Navbar (logo / menu / back) stays on mobile article pages.
 * Compact ArticleStickyHeader was removed so the general header is not replaced
 * and the headline is not clipped under a second fixed bar.
 */
export function ArticlePageChrome() {
  return <ArticleScrollProgress />
}
