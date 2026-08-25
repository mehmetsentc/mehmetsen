'use client'

/**
 * CityThreadCard — Twitter/Threads tarzı haber kartı (city subdomains only).
 *
 * Layout:
 *   [Avatar] Kaynak adı · Zaman önce            [⋯]
 *   Başlık
 *   Özet…  devamını oku
 *   [Görsel]
 *   [Kategori chip]
 *   ♡  ↗
 */

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Heart, MoreHorizontal, Share2 } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { saveArticleNav } from '@/lib/articleNavContext'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SUMMARY_LIMIT = 160

/** Türkçe göreli süre (Threads tarzı kısa format) */
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

/** Kaynak adından renkli avatar */
const AVATAR_COLORS = [
  'bg-red-500',    'bg-blue-500',  'bg-emerald-600',
  'bg-purple-500', 'bg-orange-500','bg-teal-500',
  'bg-pink-500',   'bg-indigo-500',
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
  /** Feed listesi — haber detayında swipe nav için */
  feedItems?: NewsItem[]
  feedIndex?: number
  priority?: boolean
}

// ─── Kart ────────────────────────────────────────────────────────────────────

export function CityThreadCard({ item, feedItems, feedIndex, priority }: CityThreadCardProps) {
  const [expanded, setExpanded] = useState(false)
  const href = newsItemDetailHref(item)
  const summary = item.description?.trim() ?? ''
  const isLong = summary.length > SUMMARY_LIMIT
  const displaySummary =
    expanded || !isLong ? summary : `${summary.slice(0, SUMMARY_LIMIT).trimEnd()}…`
  const categoryLabel = getCategoryLabel(item.category)
  const ago = timeAgo(item.publishedAt)

  /** Habere gitmeden önce nav context'i kaydet (swipe arası geçiş için) */
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
      {/* ── Üst satır: avatar + kaynak + zaman + ⋯ ── */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <SourceAvatar source={item.source} />
          <div className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-[rgb(var(--color-text))]">
              {item.source ?? 'NaHaber'}
            </span>
            {ago && (
              <span className="text-xs text-[rgb(var(--color-muted))]">{ago}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label="Daha fazla"
          className="shrink-0 rounded-full p-1 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface-raised))]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* ── Başlık ── */}
      <Link href={href} onClick={handleNavigate} className="block">
        <h3 className="mb-2 text-[15px] font-bold leading-snug text-[rgb(var(--color-text))]">
          {item.title}
        </h3>
      </Link>

      {/* ── Özet + devamını oku ── */}
      {summary && (
        <p className="mb-3 text-sm leading-relaxed text-[rgb(var(--color-text-secondary))]">
          {displaySummary}
          {isLong && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="ml-1 font-medium text-[rgb(var(--color-brand))]"
            >
              devamını oku
            </button>
          )}
        </p>
      )}

      {/* ── Görsel ── */}
      {item.imageUrl && (
        <Link
          href={href}
          onClick={handleNavigate}
          className="mb-3 block overflow-hidden rounded-xl"
        >
          <div className="relative aspect-[16/9] w-full">
            <SafeNewsImage
              src={item.imageUrl}
              alt={item.title}
              fill
              sizes="(max-width: 640px) 100vw, 600px"
              priority={priority}
              className="object-cover transition-transform duration-300 hover:scale-[1.01]"
            />
          </div>
        </Link>
      )}

      {/* ── Kategori chip ── */}
      {categoryLabel && (
        <div className="mb-3">
          <span className="inline-flex items-center rounded-full bg-[rgb(var(--color-surface-raised))] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--color-text-secondary))]">
            {categoryLabel}
          </span>
        </div>
      )}

      {/* ── Aksiyonlar ── */}
      <div className="flex items-center gap-5 text-[rgb(var(--color-muted))]">
        <button
          type="button"
          aria-label="Beğen"
          className="flex items-center gap-1.5 text-sm transition-colors hover:text-red-500"
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
          className="flex items-center gap-1.5 text-sm transition-colors hover:text-[rgb(var(--color-text))]"
        >
          <Share2 className="h-4 w-4" />
        </button>

        <Link
          href={href}
          onClick={handleNavigate}
          className="ml-auto text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
        >
          Habere git →
        </Link>
      </div>
    </article>
  )
}
