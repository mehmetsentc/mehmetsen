'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import {
  TrendingUp,
  Hash,
  Clapperboard,
  MapPin,
  Newspaper,
  Loader2,
  Search,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { useTrendingTopics } from '@/hooks/useTrendingTopics'
import { postService } from '@/services/postService'
import { getCategoryLabel } from '@/lib/newsMapper'
import { hasVideoContent } from '@/lib/postUtils'
import type { Post } from '@/types/post'

function DiscoverContent() {
  const { topics, loading: topicsLoading } = useTrendingTopics()
  const [trendingNews, setTrendingNews] = useState<Post[]>([])
  const [trendingVideos, setTrendingVideos] = useState<Post[]>([])
  const [cities, setCities] = useState<Array<{ slug: string; name: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      postService.getNewsTimeline(undefined, { feedSource: 'nahaber' }),
      postService.getVideoFeed(),
      postService.getRecentCities(12),
    ])
      .then(([newsResult, videoResult, cityList]) => {
        if (cancelled) return
        setTrendingNews(newsResult.posts.slice(0, 8))
        setTrendingVideos(videoResult.posts.slice(0, 6))
        setCities(cityList.map((c) => ({ slug: c.slug, name: c.name })))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Keşfet</h1>
          <p className="page-subtitle">Trend haberler, videolar ve şehirler</p>
        </div>
        <Link
          href={ROUTES.SEARCH}
          className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-medium text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface))]"
        >
          <Search className="h-4 w-4" />
          Ara
        </Link>
      </div>

      <section className="surface-card-padded">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h2 className="section-heading">Trend Konular</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {topics.map((item) => (
            <Link
              key={item.tag}
              href={`${ROUTES.SEARCH}?q=${encodeURIComponent(item.tag)}`}
              className="tag-pill"
            >
              #{item.tag}
              {!topicsLoading && item.count > 0 ? (
                <span className="ml-1 text-[rgb(var(--color-muted))]">({item.count})</span>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-[rgb(var(--color-muted))]" />
            <h2 className="section-heading">Gündem Haberleri</h2>
          </div>
        </div>
        {loading ? (
          <ul className="divide-y divide-[rgb(var(--color-border))]">
            {[...Array(5)].map((_, i) => (
              <li key={`news-sk-${i}`} className="flex gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-[rgb(var(--color-border))]">
            {trendingNews.map((post) => (
              <li key={post.id}>
                <Link
                  href={
                    post.slug && post.slug !== post.id
                      ? ROUTES.NEWS_DETAIL(post.slug)
                      : ROUTES.POST_DETAIL(post.id)
                  }
                  className="flex gap-3 px-4 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold text-[rgb(var(--color-text))]">
                      {post.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">
                      {getCategoryLabel(post.categoryId)}
                      {post.source ? ` · ${post.source}` : ''}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card overflow-hidden">
        <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-[rgb(var(--color-muted))]" />
            <h2 className="section-heading">Trend Videolar</h2>
          </div>
        </div>
        {loading ? (
          <ul className="divide-y divide-[rgb(var(--color-border))]">
            {[...Array(4)].map((_, i) => (
              <li key={`video-sk-${i}`} className="flex gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-[rgb(var(--color-border))]">
            {trendingVideos.map((post) => (
              <li key={post.id}>
                <Link
                  href={hasVideoContent(post) ? ROUTES.REELS_VIDEO(post.id) : ROUTES.POST_DETAIL(post.id)}
                  className="flex gap-3 px-4 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold text-[rgb(var(--color-text))]">
                      {post.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">Video · {post.viewsCount} görüntülenme</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cities.length > 0 && (
        <section className="surface-card-padded">
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[rgb(var(--color-muted))]" />
            <h2 className="section-heading">Şehirler</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <Link
                key={city.slug}
                href={`${ROUTES.FEED}?city=${encodeURIComponent(city.slug)}`}
                className="tag-pill"
              >
                {city.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="surface-card-padded">
        <div className="mb-3 flex items-center gap-2">
          <Hash className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          <h2 className="section-heading">Kategoriler</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DEFAULT_CATEGORIES.map((cat) => (
            <Link key={cat.id} href={`${ROUTES.FEED}?category=${cat.id}`} className="category-link">
              {cat.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-muted))]" />
        </div>
      }
    >
      <DiscoverContent />
    </Suspense>
  )
}
