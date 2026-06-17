'use client'

import Link from 'next/link'
import { ChevronRight, Zap } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { useBreakingNews } from '@/hooks/useBreakingNews'

/** Mobilde slider altı — son dakika başlık listesi (web sağ panelinin mobil karşılığı). */
export function BreakingNewsFeed() {
  const { posts, loading } = useBreakingNews()

  if (loading) {
    return (
      <div className="surface-card-padded mb-4 md:hidden">
        <ul className="space-y-2">
          {[1, 2, 3].map((i) => (
            <li key={i} className="h-4 animate-pulse rounded bg-[rgb(var(--color-border))]" />
          ))}
        </ul>
      </div>
    )
  }

  if (posts.length === 0) return null

  return (
    <section className="surface-card-padded mb-4 md:hidden" aria-label="Son dakika haberleri">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-red-500" />
          <h2 className="section-heading">Son Dakika</h2>
        </div>
        <Link
          href={ROUTES.CATEGORY('son-dakika')}
          className="flex items-center gap-0.5 text-xs font-semibold text-red-500"
        >
          Tüm feed
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ul className="space-y-2">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={ROUTES.NEWS_DETAIL(post.slug ?? post.id)}
              className="group flex items-start gap-2 rounded-lg p-1.5 transition-colors hover:bg-[rgb(var(--color-surface))]"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              <p className="line-clamp-2 text-sm font-medium leading-snug text-[rgb(var(--color-text))] group-hover:text-red-500">
                {post.title}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
