'use client'

/**
 * Feed V3 — full article in a Comments-style bottom sheet.
 * Local experiment surface (/feed-v3). Does not replace Feed V2 page-turn Reader.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { getClientAuthToken } from '@/lib/firebase/auth'
import { FEED_READER_CSS_VARS } from '@/lib/feed/reader/tokens'
import {
  formatReaderCategoryLabel,
  pickFullReaderCopy,
} from '@/lib/feed/reader/presentationCopy'
import { stripDuplicateHeroFromBodyHtml } from '@/lib/feed/reader/mediaPolicy'
import type { FeedItemDto } from '@/types/smartFeed'
import type { FeedReaderArticleDto } from '@/types/feedReader'
import { cn } from '@/lib/utils'

type FetchState = 'idle' | 'loading' | 'ok' | 'error'

type Props = {
  item: FeedItemDto
  open: boolean
  onClose: () => void
}

export function FeedArticleBottomSheet({ item, open, onClose }: Props) {
  const titleId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [detail, setDetail] = useState<FeedReaderArticleDto | null>(null)
  const [fetchState, setFetchState] = useState<FetchState>('idle')
  const [viewportBox, setViewportBox] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.classList.add('smart-feed-article-sheet-open')
    document.body.classList.add('smart-feed-article-sheet-open')
    return () => {
      document.body.style.overflow = prev
      document.documentElement.classList.remove('smart-feed-article-sheet-open')
      document.body.classList.remove('smart-feed-article-sheet-open')
    }
  }, [open])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const vv = window.visualViewport
    const sync = () => {
      if (vv) {
        setViewportBox({
          top: Math.round(vv.offsetTop),
          left: Math.round(vv.offsetLeft),
          width: Math.round(vv.width),
          height: Math.round(vv.height),
        })
        return
      }
      setViewportBox({
        top: 0,
        left: 0,
        width: Math.round(window.innerWidth),
        height: Math.round(window.innerHeight),
      })
    }
    sync()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [open])

  const loadBody = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setFetchState('loading')
    setDetail(null)
    try {
      const token = await getClientAuthToken()
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`/api/feed/v2/reader/${encodeURIComponent(item.slug)}`, {
        headers,
        signal: ac.signal,
        cache: 'no-store',
      })
      if (!res.ok) {
        setFetchState('error')
        return
      }
      const data = (await res.json()) as { article?: FeedReaderArticleDto }
      if (!data.article) {
        setFetchState('error')
        return
      }
      setDetail(data.article)
      setFetchState('ok')
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return
      setFetchState('error')
    }
  }, [item.slug])

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      setDetail(null)
      setFetchState('idle')
      return
    }
    void loadBody()
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0 })
    })
  }, [open, item.articleId, loadBody])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const headline = pickFullReaderCopy(detail?.headline, item.headline) || item.headline
  const summary = pickFullReaderCopy(detail?.summary, item.summary)
  const categoryLabel = formatReaderCategoryLabel(detail?.category || item.category)
  const publisherName = detail?.publisher?.name || item.publisher?.name || 'Kaynak'
  const heroUrl = detail?.image || item.image
  const bodyHtml = stripDuplicateHeroFromBodyHtml(detail?.bodyHtml ?? null, heroUrl)
  const canonicalPath = detail?.canonicalPath || `/haber/${item.slug}`
  const vvHeight = viewportBox?.height ?? null
  const sheetMaxHeight =
    vvHeight != null ? Math.min(vvHeight * 0.94, Math.max(280, vvHeight - 8)) : undefined

  return (
    <div
      className="z-[125] flex items-end justify-center overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="feed-v3-article-sheet"
      style={{
        position: 'fixed',
        top: viewportBox?.top ?? 0,
        left: viewportBox?.left ?? 0,
        width: viewportBox?.width ?? '100%',
        height: viewportBox?.height ?? '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        ...FEED_READER_CSS_VARS,
      }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Kapat"
        data-testid="feed-v3-article-sheet-backdrop"
      />

      <div
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-t border-white/10 shadow-2xl"
        style={{
          width: '100%',
          maxWidth: '100%',
          height: sheetMaxHeight ? `${Math.round(sheetMaxHeight * 0.92)}px` : 'min(88dvh, 92dvh)',
          maxHeight: sheetMaxHeight ? `${sheetMaxHeight}px` : '94dvh',
          background: 'var(--reader-page-bg)',
          color: 'var(--reader-page-text)',
          boxSizing: 'border-box',
        }}
        data-testid="feed-v3-article-sheet-panel"
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2">
          <div className="h-1.5 w-12 rounded-full bg-white/25" aria-hidden />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--reader-accent)]">
              {categoryLabel || 'Haber'}
              <span className="text-white/25"> · </span>
              <span className="normal-case tracking-normal text-[color:var(--reader-page-muted)]">
                {publisherName}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-white/80 hover:bg-white/10"
            aria-label="Kapat"
            data-testid="feed-v3-article-sheet-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
          data-testid="feed-v3-article-sheet-scroll"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <h2
            id={titleId}
            className="break-words font-serif text-[1.55rem] font-bold leading-[1.15] tracking-[-0.02em]"
            style={{ fontFamily: 'var(--font-serif-display, Georgia, serif)' }}
          >
            {headline}
          </h2>

          {summary ? (
            <p className="mt-4 border-l-[3px] border-[color:var(--reader-accent)] pl-3 text-[1.05rem] font-semibold leading-snug text-[color:var(--reader-prose-text)]">
              {summary}
            </p>
          ) : null}

          {heroUrl ? (
            <div className="relative mt-5 aspect-[16/9] w-full overflow-hidden rounded-xl bg-[color:var(--reader-page-elevated)]">
              <Image
                src={heroUrl}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 704px) 100vw, 512px"
                unoptimized
              />
            </div>
          ) : null}

          {fetchState === 'loading' ? (
            <div className="mt-8 flex justify-center py-8" aria-busy>
              <Loader2 className="h-6 w-6 animate-spin text-[color:var(--reader-page-muted)]" />
            </div>
          ) : null}

          {fetchState === 'error' ? (
            <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-100">
              <p>Haber ayrıntıları yüklenemedi.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-[color:var(--reader-accent)] px-3 py-1.5 text-white"
                  onClick={() => void loadBody()}
                >
                  Tekrar dene
                </button>
                <Link
                  href={canonicalPath}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-3 py-1.5"
                >
                  Tam sayfa <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : null}

          {bodyHtml ? (
            <div
              className={cn('feed-reader-body reader-body mt-6')}
              data-testid="feed-v3-article-sheet-body"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : null}

          <aside className="mt-8 rounded-xl border border-white/10 bg-[color:var(--reader-page-elevated)] p-4 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--reader-page-muted)]">
              Kaynak
            </p>
            <p className="mt-1 font-medium">{detail?.source || publisherName}</p>
            {detail?.sourceUrl ? (
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[color:var(--reader-accent)] underline"
              >
                Kaynak bağlantısı <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  )
}
