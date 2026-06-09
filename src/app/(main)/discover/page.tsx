'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Suspense, useEffect, useMemo, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Hash,
  Clapperboard,
  MapPin,
  Search,
  Flame,
  Zap,
  BarChart3,
  Loader2,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { useTrendingTopics } from '@/hooks/useTrendingTopics'
import { postService } from '@/services/postService'
import { getCategoryLabel } from '@/lib/newsMapper'
import { hasVideoContent } from '@/lib/postUtils'
import { resolveTimelineImageUrl } from '@/lib/feedMediaUtils'
import { formatTimelineRelative } from '@/lib/timelineUtils'
import { cn } from '@/lib/utils'
import type { Post } from '@/types/post'
import type { TrendingTopic } from '@/lib/trendingUtils'

// ── Category colors map ──────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  'son-dakika':   'bg-red-600',
  'gundem':       'bg-orange-500',
  'siyaset':      'bg-purple-600',
  'ekonomi':      'bg-emerald-600',
  'teknoloji':    'bg-blue-600',
  'spor':         'bg-green-600',
  'dunya':        'bg-sky-600',
  'saglik':       'bg-pink-600',
  'kultur':       'bg-amber-600',
  'bilim':        'bg-violet-600',
  'magazin':      'bg-rose-500',
  'yerel-haber':  'bg-teal-600',
}

function categoryColor(id?: string | null) {
  return CATEGORY_COLORS[id ?? ''] ?? 'bg-[rgb(var(--color-brand))]'
}

// ── Trending score helpers ───────────────────────────────────
function trendScore(count: number, maxCount: number): number {
  if (maxCount === 0) return 10
  return Math.max(10, Math.round((count / maxCount) * 100))
}

type TrendDir = 'up' | 'down' | 'flat'
function pseudoDirection(tag: string, count: number): TrendDir {
  // Deterministic "direction" based on tag chars + count parity (no historical data yet)
  const seed = tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  if (count === 0) return (seed % 3 === 0) ? 'flat' : (seed % 2 === 0 ? 'down' : 'up')
  return (seed % 3 === 0) ? 'flat' : (count % 2 === 0 ? 'up' : 'up')
}

function DirIcon({ dir }: { dir: TrendDir }) {
  if (dir === 'up')   return <TrendingUp  className="h-3.5 w-3.5 text-emerald-500" />
  if (dir === 'down') return <TrendingDown className="h-3.5 w-3.5 text-red-400" />
  return <Minus className="h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
}

// ── Components ───────────────────────────────────────────────
function TrendingTopicRow({ item, rank, maxCount }: { item: TrendingTopic; rank: number; maxCount: number }) {
  const score = trendScore(item.count, maxCount)
  const dir   = pseudoDirection(item.tag, item.count)

  return (
    <Link
      href={`${ROUTES.SEARCH}?q=${encodeURIComponent(item.tag)}`}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[rgb(var(--color-card))]"
    >
      {/* Rank */}
      <span className="w-5 shrink-0 text-center text-xs font-bold text-[rgb(var(--color-muted))]">
        {rank}
      </span>

      {/* Tag + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[rgb(var(--color-text))]">
          #{item.tag}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <DirIcon dir={dir} />
          <span className="text-[11px] text-[rgb(var(--color-muted))]">
            {item.count > 0 ? `${item.count} haber` : 'Yükselen'}
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="flex w-16 shrink-0 flex-col items-end gap-1">
        <span className="text-[11px] font-bold text-[rgb(var(--color-brand))]">{score}</span>
        <div className="h-1 w-full overflow-hidden rounded-full bg-[rgb(var(--color-border))]">
          <div
            className="h-full rounded-full bg-[rgb(var(--color-brand))] transition-all"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </Link>
  )
}

function NewsCardCompact({ post }: { post: Post }) {
  const { url: imageUrl, isFallback } = resolveTimelineImageUrl(post)
  const rel = formatTimelineRelative(post.publishedAt)
  const href = post.slug && post.slug !== post.id
    ? ROUTES.NEWS_DETAIL(post.slug)
    : ROUTES.POST_DETAIL(post.id)

  return (
    <Link href={href} className="group flex gap-3 rounded-lg p-2.5 transition-colors hover:bg-[rgb(var(--color-card))]">
      {!isFallback && imageUrl && (
        <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg">
          <Image src={imageUrl} alt="" fill className="object-cover" sizes="96px" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[0.8125rem] font-semibold leading-snug text-[rgb(var(--color-text))] group-hover:text-[rgb(var(--color-brand))]">
          {post.title}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', categoryColor(post.categoryId))} />
          <span className="text-[11px] text-[rgb(var(--color-muted))]">
            {getCategoryLabel(post.categoryId)}
            {rel ? ` · ${rel}` : ''}
          </span>
        </div>
      </div>
    </Link>
  )
}

function VideoCardCompact({ post }: { post: Post }) {
  const { url: imageUrl, isFallback } = resolveTimelineImageUrl(post)
  const href = hasVideoContent(post) ? ROUTES.REELS_VIDEO(post.id) : ROUTES.POST_DETAIL(post.id)

  return (
    <Link href={href} className="group flex gap-3 rounded-lg p-2.5 transition-colors hover:bg-[rgb(var(--color-card))]">
      {!isFallback && imageUrl && (
        <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg">
          <Image src={imageUrl} alt="" fill className="object-cover" sizes="96px" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Clapperboard className="h-5 w-5 text-white drop-shadow" />
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[0.8125rem] font-semibold leading-snug text-[rgb(var(--color-text))] group-hover:text-[rgb(var(--color-brand))]">
          {post.title}
        </p>
        <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">
          {post.viewsCount ? `${post.viewsCount.toLocaleString('tr-TR')} görüntülenme` : 'Video'}
        </p>
      </div>
    </Link>
  )
}

const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  'son-dakika':  { icon: '🔴', color: 'bg-red-600/10 text-red-500 border-red-600/20' },
  'gundem':      { icon: '📰', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  'siyaset':     { icon: '🏛️', color: 'bg-purple-600/10 text-purple-400 border-purple-600/20' },
  'ekonomi':     { icon: '📈', color: 'bg-emerald-600/10 text-emerald-400 border-emerald-600/20' },
  'teknoloji':   { icon: '💻', color: 'bg-blue-600/10 text-blue-400 border-blue-600/20' },
  'spor':        { icon: '⚽', color: 'bg-green-600/10 text-green-400 border-green-600/20' },
  'dunya':       { icon: '🌍', color: 'bg-sky-600/10 text-sky-400 border-sky-600/20' },
  'saglik':      { icon: '🏥', color: 'bg-pink-600/10 text-pink-400 border-pink-600/20' },
  'kultur':      { icon: '🎭', color: 'bg-amber-600/10 text-amber-400 border-amber-600/20' },
  'bilim':       { icon: '🔬', color: 'bg-violet-600/10 text-violet-400 border-violet-600/20' },
  'magazin':     { icon: '⭐', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  'yerel-haber': { icon: '📍', color: 'bg-teal-600/10 text-teal-400 border-teal-600/20' },
}

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
        setTrendingNews(newsResult.posts.slice(0, 6))
        setTrendingVideos(videoResult.posts.slice(0, 4))
        setCities(cityList.map((c) => ({ slug: c.slug, name: c.name })))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const maxCount = useMemo(
    () => Math.max(...topics.map((t) => t.count), 1),
    [topics]
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-[rgb(var(--color-text))]">Keşfet</h1>
          <p className="text-xs text-[rgb(var(--color-muted))]">Trend haberler, konular ve daha fazlası</p>
        </div>
        <Link
          href={ROUTES.SEARCH}
          className="flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-card))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-border))]"
        >
          <Search className="h-3.5 w-3.5" />
          Ara
        </Link>
      </div>

      {/* ── Trending Topics ── */}
      <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
        <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
          <Flame className="h-4 w-4 text-[rgb(var(--color-brand))]" />
          <h2 className="text-sm font-black tracking-tight text-[rgb(var(--color-text))]">Trend Konular</h2>
          <span className="ml-auto rounded-full bg-[rgb(var(--color-brand))]/10 px-2 py-0.5 text-[10px] font-bold text-[rgb(var(--color-brand))]">
            CANLI
          </span>
        </div>
        <div className="divide-y divide-[rgb(var(--color-border))/0.5] px-1 py-1">
          {topicsLoading
            ? [...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="h-3 w-4" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                  <Skeleton className="h-2 w-14" />
                </div>
              ))
            : topics.map((item, i) => (
                <TrendingTopicRow key={item.tag} item={item} rank={i + 1} maxCount={maxCount} />
              ))}
        </div>
      </section>

      {/* ── Breaking / Top News ── */}
      <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
        <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
          <Zap className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-black tracking-tight text-[rgb(var(--color-text))]">Gündem Haberleri</h2>
          <Link href={ROUTES.FEED} className="ml-auto text-[11px] font-semibold text-[rgb(var(--color-brand))]">
            Tümü →
          </Link>
        </div>
        <div className="divide-y divide-[rgb(var(--color-border))/0.5] px-1 py-1">
          {loading
            ? [...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-3 p-2.5">
                  <Skeleton className="h-16 w-24 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))
            : trendingNews.map((post) => <NewsCardCompact key={post.id} post={post} />)}
        </div>
      </section>

      {/* ── Trending Videos ── */}
      {(loading || trendingVideos.length > 0) && (
        <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
          <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
            <Clapperboard className="h-4 w-4 text-purple-500" />
            <h2 className="text-sm font-black tracking-tight text-[rgb(var(--color-text))]">Trend Videolar</h2>
            <Link href={ROUTES.REELS} className="ml-auto text-[11px] font-semibold text-[rgb(var(--color-brand))]">
              Tümü →
            </Link>
          </div>
          <div className="divide-y divide-[rgb(var(--color-border))/0.5] px-1 py-1">
            {loading
              ? [...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-3 p-2.5">
                    <Skeleton className="h-16 w-24 shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))
              : trendingVideos.map((post) => <VideoCardCompact key={post.id} post={post} />)}
          </div>
        </section>
      )}

      {/* ── Cities ── */}
      {cities.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
          <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
            <MapPin className="h-4 w-4 text-teal-500" />
            <h2 className="text-sm font-black tracking-tight text-[rgb(var(--color-text))]">Şehirler</h2>
          </div>
          <div className="flex flex-wrap gap-2 p-3">
            {cities.map((city) => (
              <Link
                key={city.slug}
                href={`${ROUTES.FEED}?city=${encodeURIComponent(city.slug)}`}
                className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-text))] transition-colors hover:border-[rgb(var(--color-brand))] hover:text-[rgb(var(--color-brand))]"
              >
                📍 {city.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Categories ── */}
      <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
        <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
          <BarChart3 className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          <h2 className="text-sm font-black tracking-tight text-[rgb(var(--color-text))]">Kategoriler</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          {DEFAULT_CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat.id]
            return (
              <Link
                key={cat.id}
                href={`${ROUTES.FEED}?category=${cat.id}`}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors hover:opacity-80',
                  meta?.color ?? 'border-[rgb(var(--color-border))] text-[rgb(var(--color-text))]'
                )}
              >
                {meta?.icon && <span>{meta.icon}</span>}
                {cat.name}
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-muted))]" />
      </div>
    }>
      <DiscoverContent />
    </Suspense>
  )
}
