'use client'

import { usePathname } from 'next/navigation'
import { ArticleScrollProgress } from '@/components/news/ArticleScrollProgress'
import { ArticleSwipeNav } from '@/components/news/ArticleSwipeNav'

/**
 * Article reading chrome — scroll progress + swipe-between-articles nav.
 * Site Navbar (logo / menu / back) stays on mobile article pages.
 */
export function ArticlePageChrome() {
  const pathname = usePathname()
  return (
    <>
      <ArticleScrollProgress />
      <ArticleSwipeNav currentHref={pathname} />
    </>
  )
}
