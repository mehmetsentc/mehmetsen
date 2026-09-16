'use client'

import { usePathname } from 'next/navigation'
import { ArticleBackBar } from '@/components/news/ArticleBackBar'
import { ArticleScrollProgress } from '@/components/news/ArticleScrollProgress'
import { ArticleSwipeNav } from '@/components/news/ArticleSwipeNav'

/**
 * Article reading chrome — scroll progress + swipe-between-articles nav + back.
 * Site Navbar (logo / menu / back) stays on mobile article pages; ArticleBackBar
 * is a belt for Lift / stuck chrome-lock cases where Navbar is obscured.
 */
export function ArticlePageChrome() {
  const pathname = usePathname()
  return (
    <>
      <ArticleBackBar />
      <ArticleScrollProgress />
      <ArticleSwipeNav currentHref={pathname} />
    </>
  )
}
