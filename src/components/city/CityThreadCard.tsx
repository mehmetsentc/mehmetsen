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

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Bookmark, BookmarkCheck, Heart, MessageCircle, Play, Share2 } from 'lucide-react'
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

// ─── Medya listesi ────────────────────────────────────────────────────────────

interface MediaSlide {
  src: string
  isVideo: boolean
}

function buildMediaSlides(item: NewsItem): MediaSlide[] {
  const slides: MediaSlide[] = []

  // 1. Video varsa ilk slide video önizlemesi
  if (item.videoUrl) {
    const thumb = videoThumbnail(item.videoUrl) ?? item.imageUrl
    if (thumb) slides.push({ src: thumb, isVideo: true })
  }

  // 2. Kapak görseli (video thumbail'dan farklıysa)
  if (item.imageUrl && !slides.some((s) => s.src === item.imageUrl)) {
    slides.push({ src: item.imageUrl, isVideo: false })
  }

  // 3. Ek görseller
  if (item.additionalImages?.length) {
    for (const img of item.additionalImages) {
      if (img.url && !slides.some((s) => s.src === img.url)) {
        slides.push({ src: img.url, isVideo: false })
      }
    }
  }

  return slides
}

// ─── Kart ────────────────────────────────────────────────────────────────────

export function CityThreadCard({ item, feedItems, feedIndex, priority }: CityThreadCardProps) {
  const href = newsItemDetailHref(item)
  const categoryLabel = getCategoryLabel(item.category)
  const ago = timeAgo(item.publishedAt)
  // summary > description tercih sırası; hiçbiri yoksa boş
  const summary = (item.summary?.trim() || item.description?.trim()) ?? ''

  const mediaSlides = buildMediaSlides(item)
  const hasMedia = mediaSlides.length > 0
  const isGallery = mediaSlides.length > 1

  const handleNavigate = useCallback(() => {
    if (feedItems && feedIndex !== undefined) {
      saveArticleNav({
        hrefs: feedItems.map(newsItemDetailHref),
        index: feedIndex,
        source: 'feed',
      })
    }
  }, [feedItems, feedIndex])

  const [saved, setSaved] = useState(false)
  const [liked, setLiked] = useState(false)

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}${href}`
    if (navigator.share) {
      try { await navigator.share({ title: item.title, url }); return } catch {}
    }
    try { await navigator.clipboard.writeText(url) } catch {}
  }, [href, item.title])

  const handleSave = useCallback(() => {
    setSaved((v) => !v)
    // TODO: persist to user's saved list
  }, [])

  const handleLike = useCallback(() => {
    setLiked((v) => !v)
    // TODO: persist like
  }, [])

  return (
    <article className="border-b border-[rgb(var(--color-border))] px-4 py-4">

      {/* ── 1. Üst: NaHaber avatarı + zaman ── */}
      <div className="mb-3 flex items-center gap-2.5">
        <SourceAvatar source="NaHaber" />
        <div className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-[rgb(var(--color-text))]">
            NaHaber
          </span>
          {ago && (
            <span className="text-[11px] text-[rgb(var(--color-muted))]">{ago}</span>
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

      {/* ── 4. Görsel / Video / Galeri — en altta ── */}
      {hasMedia && (
        <div className="relative mb-3">
          {isGallery ? (
            /* Birden fazla medya → yatay kaydırmalı galeri */
            <div className="relative">
              <div
                className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide rounded-xl"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {mediaSlides.map((slide, idx) => (
                  <Link
                    key={idx}
                    href={href}
                    onClick={handleNavigate}
                    className="relative shrink-0 overflow-hidden rounded-xl snap-center"
                    style={{ width: 'calc(100% - 28px)' }}
                  >
                    <div className="relative aspect-[16/9] w-full bg-black">
                      <SafeNewsImage
                        src={slide.src}
                        alt={`${item.title} — ${idx + 1}`}
                        fill
                        sizes="(max-width: 640px) 92vw, 560px"
                        priority={priority && idx === 0}
                        className="object-cover opacity-90"
                      />
                      {slide.isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                            <Play className="h-6 w-6 fill-white text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
              {/* Sayaç badge */}
              <span className="pointer-events-none absolute bottom-2 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                1 / {mediaSlides.length}
              </span>
            </div>
          ) : (
            /* Tek medya → tam genişlik */
            <Link
              href={href}
              onClick={handleNavigate}
              className="block overflow-hidden rounded-xl"
            >
              <div className="relative aspect-[16/9] w-full bg-black">
                <SafeNewsImage
                  src={mediaSlides[0]!.src}
                  alt={item.title}
                  fill
                  sizes="(max-width: 640px) 100vw, 600px"
                  priority={priority}
                  className="object-cover opacity-90"
                />
                {mediaSlides[0]!.isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                      <Play className="h-6 w-6 fill-white text-white" />
                    </div>
                  </div>
                )}
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ── 5. Kategori chip + aksiyonlar ── */}
      <div className="flex items-center gap-2">
        {categoryLabel && (
          <span className="shrink-0 rounded-full bg-[rgb(var(--color-surface-raised))] px-2.5 py-0.5 text-[11px] font-medium text-[rgb(var(--color-text-secondary))]">
            {categoryLabel}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3.5 text-[rgb(var(--color-muted))]">

          {/* Beğen */}
          <button
            type="button"
            aria-label="Beğen"
            onClick={handleLike}
            className={cn(
              'flex items-center gap-1 transition-colors',
              liked ? 'text-red-500' : 'hover:text-red-500'
            )}
          >
            <Heart className={cn('h-4 w-4', liked && 'fill-red-500 text-red-500')} />
            {(item.likesCount ?? 0) + (liked ? 1 : 0) > 0 && (
              <span className="text-[11px]">{(item.likesCount ?? 0) + (liked ? 1 : 0)}</span>
            )}
          </button>

          {/* Yorum yap */}
          <Link
            href={`${href}#yorumlar`}
            onClick={handleNavigate}
            aria-label="Yorum yap"
            className="flex items-center gap-1 transition-colors hover:text-[rgb(var(--color-text))]"
          >
            <MessageCircle className="h-4 w-4" />
            {item.commentsCount ? (
              <span className="text-[11px]">{item.commentsCount}</span>
            ) : null}
          </Link>

          {/* Paylaş */}
          <button
            type="button"
            onClick={handleShare}
            aria-label="Paylaş"
            className="transition-colors hover:text-[rgb(var(--color-text))]"
          >
            <Share2 className="h-4 w-4" />
          </button>

          {/* Kaydet */}
          <button
            type="button"
            onClick={handleSave}
            aria-label={saved ? 'Kaydedildi' : 'Kaydet'}
            className={cn(
              'transition-colors',
              saved ? 'text-[rgb(var(--color-brand))]' : 'hover:text-[rgb(var(--color-text))]'
            )}
          >
            {saved
              ? <BookmarkCheck className="h-4 w-4 fill-[rgb(var(--color-brand))] text-[rgb(var(--color-brand))]" />
              : <Bookmark className="h-4 w-4" />
            }
          </button>

        </div>
      </div>

    </article>
  )
}
