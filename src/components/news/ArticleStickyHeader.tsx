'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { Badge } from '@/components/ui/Badge'
import { getCategoryLabel } from '@/lib/newsMapper'
import type { Post } from '@/types/post'

interface ArticleStickyHeaderProps {
  post: Post
  /** Scroll sonrası başlık satırını göster (px). Üst araç çubuğu her zaman görünür. */
  threshold?: number
}

/**
 * Mobil haber detayı: sabit üst çubuk (geri + kategori + kapat) ve scroll sonrası başlık.
 */
export function ArticleStickyHeader({ post, threshold = 72 }: ArticleStickyHeaderProps) {
  const router = useRouter()
  const [showTitle, setShowTitle] = useState(false)
  const categoryLabel = post.categoryId ? getCategoryLabel(post.categoryId) : null
  const backHref = post.categoryId ? ROUTES.CATEGORY(post.categoryId) : ROUTES.FEED

  useEffect(() => {
    const onScroll = () => setShowTitle((window.scrollY || 0) > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return (
    <header
      className="article-mobile-header fixed inset-x-0 top-0 z-50 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 backdrop-blur-xl lg:hidden"
      style={{ paddingTop: 'var(--mobile-sat, env(safe-area-inset-top, 0px))' }}
    >
      <div className="mx-auto max-w-3xl px-3">
        <div className="flex h-11 items-center gap-2">
          <Link
            href={backHref}
            aria-label="Geri"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface))]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {categoryLabel ? (
            <Badge variant="solid" size="sm" className="max-w-[9rem] shrink-0 truncate">
              {categoryLabel}
            </Badge>
          ) : null}
          <div className="min-w-0 flex-1" aria-hidden />
          <button
            type="button"
            onClick={() => router.push(ROUTES.FEED)}
            aria-label="Ana sayfaya dön"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface))]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {showTitle ? (
          <h2 className="line-clamp-2 pb-2.5 text-[13px] font-bold leading-snug text-[rgb(var(--color-text))]">
            {post.title}
          </h2>
        ) : null}
      </div>
    </header>
  )
}
