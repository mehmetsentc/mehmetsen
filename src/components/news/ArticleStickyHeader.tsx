'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { ROUTES } from '@/constants/routes'
import { Badge } from '@/components/ui/Badge'
import { getCategoryLabel } from '@/lib/newsMapper'
import type { Post } from '@/types/post'

interface ArticleStickyHeaderProps {
  post: Post
  /** Scroll sonrası mobil başlık çubuğu eşiği (px). */
  threshold?: number
}

/**
 * Mobil: scroll sonrası sabit kompakt başlık çubuğu.
 * Masaüstünde ArticlePageChrome içindeki site header kullanılır.
 */
export function ArticleStickyHeader({ post, threshold = 120 }: ArticleStickyHeaderProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible((window.scrollY || 0) > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  const categoryLabel = post.categoryId ? getCategoryLabel(post.categoryId) : null

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 top-0 z-50 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 backdrop-blur-xl lg:hidden"
        >
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
            <Link
              href={post.categoryId ? ROUTES.CATEGORY(post.categoryId) : ROUTES.FEED}
              aria-label="Geri"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface))]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            {categoryLabel ? (
              <Badge variant="solid" size="sm" className="shrink-0">
                {categoryLabel}
              </Badge>
            ) : null}
            <h2 className="truncate text-sm font-bold text-[rgb(var(--color-text))]">{post.title}</h2>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
