'use client'

/**
 * CityThreadCard — Threads/Twitter tarzı şehir haber kartı.
 *
 * Sıra:
 *   [Avatar] Kaynak · Zaman
 *   Manşet (başlık)
 *   Kısa özet (2 satır) + devamını oku →
 *   [Görsel 16:9 veya Video önizleme]  ← en altta
 *   [Kategori chip]  ♡  ↗
 */

import { useCallback } from 'react'
import Link from 'next/link'
import { Heart, Play, Share2 } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { saveArticleNav } from '@/lib/articleNavContext'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(value?: string | number | null): string {
  if (value == null) return ''
  const ms = typeof value === 'number' ? value : Date.parse(value as string)
  if (!Number.isFinite(ms)) return ''
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60_000)
  if (mins < 2) return 'Az önce'
  if (mins < 60) return `${mins} dk`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} sa`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} g`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} h`
  return `${Math.floor(days / 30)} ay`
}

function videoThumbnail(url: string): string | null {
  try {
    const u = new URL(url)
    const ytId =
      u.searchParams.get('v') ??
      (u.hostname === 'youtu.be' ? u.pathname.slice(1) : null) ??
      (u.hostname.includes('youtube') && u.pathname.startsWith('/embed/')
        ? u.pathname.split('/')[2]
        : null)
    if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
  } catch {}
  return null
}

const AVATAR_COLORS = [
  'bg-red-500', 'bg-blue-500', 'bg-emerald-600',
  'bg-purple-500', 'bg-orange-500', 'bg-teal-500',
  'bg-pink-500', 'bg-indigo-500',
]

function SourceAvatar({ source }: { source?: string }) {
  const letter = source?.trim()?.[0]?.toUpperCase() ?? 'N'
  const color = AVATAR_COLORS[letter.charCodeAt(0) % AVATAR_COLORS.length]
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white',
        color,
      )}
      aria-hidden
    >
      {letter}
    </span>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface CityThreadCardProps {
  item: NewsItem
  feedItems?: NewsItem[]
  feedIndex?: number
  priority?: boolean
}

// ─── Kart ────────────────────────────────────────────────────────────────────

export function CityThreadCard({ item, feedItems, feedIndex, priority }: CityThreadCardProps) {
  const href = newsItemDetailHref(item)
  const categoryLabel = getCategoryLabel(item.category)
  const ago = timeAgo(item.publishedAt)
  // summary > description tercih sırası; hiçbiri yoksa boş
  const summary = (item.summary?.trim() || item.description?.trim()) ?? ''
  const hasVideo = Boolean(item.videoUrl)
  const thumbSrc = hasVideo
    ? (videoThumbnail(item.videoUrl!) ?? item.imageUrl)
    : item.imageUrl
  const hasMedia = Boolean(thumbSrc)

  const handleNavigate = useCallback(() => {
    if (feedItems && feedIndex !== undefined) {
      saveArticleNav({
        hrefs: feedItems.map(newsItemDetailHref),
        index: feedIndex,
        source: 'feed',
      })
    }
  }, [feedItems, feedIndex])

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}${href}`
    if (navigator.share) {
      try { await navigator.share({ title: item.title, url }); return } catch {}
    }
    try { await navigator.clipboard.writeText(url) } catch {}
  }, [href, item.title])

  return (
    <article className="border-b border-[rgb(var(--color-border))] px-4 py-4">

      {/* ── 1. Üst: avatar + kaynak + zaman ── */}
      <div className="mb-3 flex items-center gap-2.5">
        <SourceAvatar source={item.source} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-[rgb(var(--color-text))]">
            {item.source ?? 'NaHaber'}
          </span>
          {ago && (
            <span className="text-xs text-[rgb(var(--color-muted))]">{ago}</span>
          )}
        </div>
      </div>

      {/* ── 2. Manşet / Başlık ── */}
      <Link href={href} onClick={handleNavigate} className="block">
        <h3 className="mb-2 line-clamp-3 text-[15px] font-bold leading-snug text-[rgb(var(--color-text))]">
          {item.title}
        </h3>
      </Link>

      {/* ── 3. Özet — tam göster, kesilmesin ── */}
      {summary && (
        <p className="mb-3 text-sm leading-relaxed text-[rgb(var(--color-text-secondary))]">
          {summary}
        </p>
      )}

      {/* ── devamını oku butonu (manşetin hemen altında) ── */}
      <Link
        href={href}
        onClick={handleNavigate}
        className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[rgb(var(--color-brand))] hover:underline"
      >
        devamını oku →
      </Link>

      {/* ── 4. Görsel / Video — en altta ── */}
      {hasMedia && (
        <Link
          href={href}
          onClick={handleNavigate}
          className="relative mb-3 block overflow-hidden rounded-xl"
        >
          <div className="relative aspect-[16/9] w-full bg-black">
            <SafeNewsImage
              src={thumbSrc!}
              alt={item.title}
              fill
              sizes="(max-width: 640px) 100vw, 600px"
              priority={priority}
              className="object-cover opacity-90"
            />
            {hasVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                  <Play className="h-6 w-6 fill-white text-white" />
                </div>
              </div>
            )}
          </div>
        </Link>
      )}

      {/* ── 5. Kategori chip + beğen/paylaş ── */}
      <div className="flex items-center gap-3">
        {categoryLabel && (
          <span className="shrink-0 rounded-full bg-[rgb(var(--color-surface-raised))] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--color-text-secondary))]">
            {categoryLabel}
          </span>
        )}
        <div className="ml-auto flex items-center gap-4 text-[rgb(var(--color-muted))]">
          <button
            type="button"
            aria-label="Beğen"
            className="flex items-center gap-1 transition-colors hover:text-red-500"
          >
            <Heart className="h-4 w-4" />
            {item.likesCount ? (
              <span className="text-xs">{item.likesCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={handleShare}
            aria-label="Paylaş"
            className="transition-colors hover:text-[rgb(var(--color-text))]"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>

    </article>
  )
}
