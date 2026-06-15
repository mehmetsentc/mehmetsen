'use client'

import Link from 'next/link'
import { TrendingUp, Hash, Zap } from 'lucide-react'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { useTrendingTopics } from '@/hooks/useTrendingTopics'
import { useBreakingNews } from '@/hooks/useBreakingNews'

export function TrendingPanel() {
  const { topics, loading } = useTrendingTopics()
  const { posts: breakingPosts, loading: breakingLoading } = useBreakingNews()

  return (
    <aside className="feed-rail space-y-4">
      {/* Son Dakika */}
      <div className="surface-card-padded">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-red-500" />
          <h3 className="section-heading">Son Dakika</h3>
        </div>
        {breakingLoading ? (
          <ul className="space-y-2">
            {[1, 2, 3].map((i) => (
              <li key={i} className="h-4 animate-pulse rounded bg-[rgb(var(--color-border))]" />
            ))}
          </ul>
        ) : breakingPosts.length > 0 ? (
          <ul className="space-y-2">
            {breakingPosts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/haber/${post.slug ?? post.id}`}
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
        ) : (
          <p className="text-sm text-[rgb(var(--color-muted))]">
            Şu an aktif son dakika haberi yok.
          </p>
        )}
      </div>

      {/* Trend Konular */}
      <div className="surface-card-padded">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h3 className="section-heading">Trend Konular</h3>
        </div>
        <ul className="space-y-3">
          {topics.map((item, i) => (
            <li key={item.tag}>
              <Link
                href={`${ROUTES.SEARCH}?q=${encodeURIComponent(item.tag)}`}
                className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-[rgb(var(--color-surface))]"
              >
                <span className="text-sm font-bold text-[rgb(var(--color-border))]">{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold text-[rgb(var(--color-text))] group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    #{item.tag}
                  </p>
                  <p className="text-xs text-[rgb(var(--color-muted))]">
                    {loading ? (
                      <span className="inline-block h-3 w-12 animate-pulse rounded bg-[rgb(var(--color-border))]" />
                    ) : (
                      `${item.count} haber`
                    )}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Kategoriler */}
      <div className="surface-card-padded">
        <div className="mb-3 flex items-center gap-2">
          <Hash className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          <h3 className="section-heading">Kategoriler</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_CATEGORIES.slice(0, 6).map((cat) => (
            <Link key={cat.id} href={`${ROUTES.FEED}?category=${cat.id}`} className="tag-pill">
              {cat.name}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  )
}
