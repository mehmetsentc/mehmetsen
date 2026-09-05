'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Loader2, Share2, Bookmark, MessageCircle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedItemDto } from '@/types/smartFeed'
import type { FeedReaderArticleDto } from '@/types/feedReader'
import {
  classifyAxisIntent,
  feedToReaderProgress,
  prefersReducedMotion,
  readerToFeedProgress,
  shouldCompleteTransition,
  shouldIgnoreSystemBackEdge,
} from '@/lib/feed/reader/gestureArbitration'
import { ReaderDwellTracker } from '@/lib/feed/reader/dwellTracker'
import {
  crossedReadDepthThresholds,
  computeReadDepthPercent,
} from '@/lib/feed/reader/readDepth'
import {
  isFeedReaderHistoryState,
  pushReaderHistory,
  replaceFeedUrl,
} from '@/lib/feed/reader/history'
import { FEED_READER_CSS_VARS, FEED_READER_DURATION_MS } from '@/lib/feed/reader/tokens'
import { getClientAuthToken } from '@/lib/firebase/auth'

export type FeedReaderCloseReason = 'gesture' | 'button' | 'history' | 'escape'

export type FeedReaderTelemetryPayload = {
  articleId: string
  clusterId: string | null
  slug: string
  category: string | null
  tags: string[]
  publisherId: string | null
  dwellMs: number
  readDepthMax: number
  thresholdsHit: number[]
}

type Props = {
  item: FeedItemDto
  open: boolean
  onClose: (reason: FeedReaderCloseReason) => void
  onOpenTelemetry?: () => void
  onCloseTelemetry?: (payload: FeedReaderTelemetryPayload) => void
  /** Optional non-telemetry body fetch debug (pilot ?readerDebug=1 only). */
  onBodyDebug?: (state: {
    started: boolean
    httpStatus: number | null
    errorCode: string | null
  }) => void
  liked?: boolean
  saved?: boolean
  likeCount?: number
  commentCount?: number
  saveCount?: number
  onToggleLike?: () => void
  onToggleSave?: () => void
  onCommentClick?: () => void
  /** Pause parent feed snap while open */
  onLockFeedScroll?: (locked: boolean) => void
}

type FetchState = 'idle' | 'loading' | 'ok' | 'error'

let openGeneration = 0

export function FeedArticleReader({
  item,
  open,
  onClose,
  onOpenTelemetry,
  onCloseTelemetry,
  onBodyDebug,
  liked,
  saved,
  likeCount,
  commentCount,
  saveCount,
  onToggleLike,
  onToggleSave,
  onCommentClick,
  onLockFeedScroll,
}: Props) {
  const titleId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const dwellRef = useRef(new ReaderDwellTracker())
  const openedRef = useRef(false)
  const depthSeenRef = useRef(new Set<number>())
  const depthMaxRef = useRef(0)
  const fetchGenRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastX: number
    lastT: number
    axis: 'none' | 'horizontal' | 'vertical'
  } | null>(null)

  const [progress, setProgress] = useState(0) // 0 = feed, 1 = reader fully open
  const [animating, setAnimating] = useState(false)
  const [detail, setDetail] = useState<FeedReaderArticleDto | null>(null)
  const [fetchState, setFetchState] = useState<FetchState>('idle')
  const [reducedMotion, setReducedMotion] = useState(false)

  const headline = detail?.headline || item.headline
  const summary = detail?.summary ?? item.summary
  const image = detail?.image || item.image
  const publisherName = detail?.publisher?.name || item.publisher?.name || 'Kaynak'
  const category = detail?.category || item.category
  const sourceUrl = detail?.sourceUrl
  const canonicalPath = detail?.canonicalPath || `/haber/${item.slug}`

  const finishClose = useCallback(
    (reason: FeedReaderCloseReason) => {
      const dwellMs = dwellRef.current.close()
      onLockFeedScroll?.(false)
      document.documentElement.classList.remove('smart-feed-reader-open')
      document.body.classList.remove('smart-feed-reader-open')
      replaceFeedUrl({})
      onCloseTelemetry?.({
        articleId: item.articleId,
        clusterId: item.clusterId,
        slug: item.slug,
        category: item.category,
        tags: item.tags ?? [],
        publisherId: item.publisher?.id ?? null,
        dwellMs,
        readDepthMax: depthMaxRef.current,
        thresholdsHit: [...depthSeenRef.current],
      })
      openedRef.current = false
      onClose(reason)
    },
    [item, onClose, onCloseTelemetry, onLockFeedScroll]
  )

  const animateTo = useCallback(
    (target: 0 | 1, reason: FeedReaderCloseReason) => {
      setAnimating(true)
      setProgress(target)
      window.setTimeout(() => {
        setAnimating(false)
        if (target === 0) finishClose(reason)
      }, reducedMotion ? 0 : FEED_READER_DURATION_MS)
    },
    [finishClose, reducedMotion]
  )

  const loadBody = useCallback(async () => {
    const gen = ++fetchGenRef.current
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setFetchState('loading')
    onBodyDebug?.({ started: true, httpStatus: null, errorCode: null })
    try {
      const token = await getClientAuthToken()
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`/api/feed/v2/reader/${encodeURIComponent(item.slug)}`, {
        headers,
        signal: ac.signal,
        cache: 'no-store',
      })
      if (gen !== fetchGenRef.current) return
      if (!res.ok) {
        setFetchState('error')
        onBodyDebug?.({
          started: true,
          httpStatus: res.status,
          errorCode: `http_${res.status}`,
        })
        return
      }
      const data = (await res.json()) as { article?: FeedReaderArticleDto }
      if (gen !== fetchGenRef.current) return
      if (!data.article) {
        setFetchState('error')
        onBodyDebug?.({
          started: true,
          httpStatus: res.status,
          errorCode: 'missing_article',
        })
        return
      }
      setDetail(data.article)
      setFetchState('ok')
      onBodyDebug?.({ started: true, httpStatus: res.status, errorCode: null })
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return
      if (gen !== fetchGenRef.current) return
      setFetchState('error')
      onBodyDebug?.({
        started: true,
        httpStatus: null,
        errorCode: 'fetch_error',
      })
    }
  }, [item.slug, onBodyDebug])

  // Open / close lifecycle
  useEffect(() => {
    setReducedMotion(prefersReducedMotion())
  }, [])

  useEffect(() => {
    if (!open) {
      setProgress(0)
      setDetail(null)
      setFetchState('idle')
      abortRef.current?.abort()
      return
    }

    openGeneration += 1
    const gen = openGeneration
    depthSeenRef.current = new Set()
    depthMaxRef.current = 0
    dwellRef.current.open()
    onLockFeedScroll?.(true)
    document.documentElement.classList.add('smart-feed-reader-open')
    document.body.classList.add('smart-feed-reader-open')
    pushReaderHistory({ slug: item.slug, articleId: item.articleId })
    setProgress(1)
    if (!openedRef.current) {
      openedRef.current = true
      onOpenTelemetry?.()
    }
    void loadBody()

    const onVis = () => {
      if (gen !== openGeneration) return
      dwellRef.current.setDocumentVisible(document.visibilityState === 'visible')
    }
    const onPop = (ev: PopStateEvent) => {
      if (gen !== openGeneration) return
      if (isFeedReaderHistoryState(ev.state)) return
      animateTo(0, 'history')
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') animateTo(0, 'escape')
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, item.slug, item.articleId, loadBody, onLockFeedScroll, onOpenTelemetry, animateTo])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const pct = computeReadDepthPercent({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    })
    depthMaxRef.current = Math.max(depthMaxRef.current, pct)
    const crossed = crossedReadDepthThresholds(pct, depthSeenRef.current)
    for (const t of crossed) depthSeenRef.current.add(t)
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (shouldIgnoreSystemBackEdge(e.clientX, window.innerWidth)) return
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastT: performance.now(),
      axis: 'none',
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (d.axis === 'none') {
      const intent = classifyAxisIntent(dx, dy)
      if (intent === 'vertical' || intent === 'none') {
        if (intent === 'vertical') dragRef.current = null
        return
      }
      d.axis = 'horizontal'
    }
    if (d.axis !== 'horizontal') return
    e.preventDefault()
    const p = 1 - readerToFeedProgress(dx, window.innerWidth)
    setProgress(Math.min(1, Math.max(0.05, p)))
    d.lastX = e.clientX
    d.lastT = performance.now()
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || d.pointerId !== e.pointerId || d.axis !== 'horizontal') return
    const dx = e.clientX - d.startX
    const dt = Math.max(1, performance.now() - d.lastT)
    const velocity = (e.clientX - d.lastX) / dt // px/ms toward right = close
    const closeProgress = readerToFeedProgress(dx, window.innerWidth)
    const complete = shouldCompleteTransition({
      progress: closeProgress,
      velocityX: Math.max(0, velocity),
    })
    if (complete) animateTo(0, 'gesture')
    else {
      setAnimating(true)
      setProgress(1)
      window.setTimeout(() => setAnimating(false), FEED_READER_DURATION_MS)
    }
  }

  if (!open && progress === 0) return null

  const styleVars = {
    ...FEED_READER_CSS_VARS,
    transform: reducedMotion
      ? undefined
      : `translate3d(${(1 - progress) * 100}%, 0, 0)`,
    opacity: reducedMotion ? (progress > 0.5 ? 1 : 0) : 0.55 + progress * 0.45,
    transition: animating && !reducedMotion ? `transform ${FEED_READER_DURATION_MS}ms ease, opacity ${FEED_READER_DURATION_MS}ms ease` : 'none',
  } as CSSProperties

  return (
    <div
      className={cn(
        'fixed inset-0 z-[130] flex justify-center',
        open || progress > 0 ? 'pointer-events-auto' : 'pointer-events-none'
      )}
      data-testid="feed-article-reader"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ background: progress > 0.02 ? 'rgba(0,0,0,0.35)' : 'transparent' }}
    >
      <div
        className="relative flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden shadow-2xl md:my-0"
        style={{
          ...styleVars,
          background: 'var(--reader-page-bg)',
          color: 'var(--reader-page-text)',
          boxShadow: progress > 0.2 ? `-12px 0 28px var(--reader-fold-shadow)` : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-black/10 px-3 py-2.5">
          <button
            type="button"
            className="rounded-full p-2 hover:bg-black/5"
            aria-label="Akışa dön"
            data-testid="feed-reader-close"
            onClick={() => animateTo(0, 'button')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs uppercase tracking-wide text-[color:var(--reader-page-muted)]">
              {category || 'Haber'}
            </p>
            <p className="truncate text-sm font-medium">{publisherName}</p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 hover:bg-black/5"
            aria-label="Kaydet"
            onClick={onToggleSave}
          >
            <Bookmark className={cn('h-5 w-5', saved && 'fill-current text-[color:var(--reader-accent)]')} />
          </button>
          <button
            type="button"
            className="rounded-full p-2 hover:bg-black/5"
            aria-label="Yorumlar"
            onClick={onCommentClick}
          >
            <MessageCircle className="h-5 w-5" />
            {typeof commentCount === 'number' && commentCount > 0 ? (
              <span className="sr-only">{commentCount} yorum</span>
            ) : null}
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-4"
          data-testid="feed-reader-scroll"
        >
          <h1 id={titleId} className="text-2xl font-semibold leading-snug tracking-tight">
            {headline}
          </h1>
          {item.publishedAt ? (
            <p className="mt-2 text-xs text-[color:var(--reader-page-muted)]">
              {new Date(item.publishedAt).toLocaleString('tr-TR')}
            </p>
          ) : null}

          {image ? (
            <div className="relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-md bg-black/5">
              <Image src={image} alt="" fill className="object-cover" sizes="(max-width: 512px) 100vw, 512px" priority />
            </div>
          ) : null}

          {summary ? (
            <p className="mt-4 text-base font-medium leading-relaxed text-[color:var(--reader-page-muted)]">
              {summary}
            </p>
          ) : null}

          {fetchState === 'loading' && !detail?.bodyHtml ? (
            <div className="mt-6 space-y-3" aria-busy="true" data-testid="feed-reader-body-skeleton">
              <div className="h-3 w-full animate-pulse rounded bg-black/10" />
              <div className="h-3 w-[92%] animate-pulse rounded bg-black/10" />
              <div className="h-3 w-[85%] animate-pulse rounded bg-black/10" />
              <div className="h-3 w-[88%] animate-pulse rounded bg-black/10" />
            </div>
          ) : null}

          {fetchState === 'error' ? (
            <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p>Haber ayrıntıları yüklenemedi.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded bg-zinc-900 px-3 py-1.5 text-white"
                  onClick={() => void loadBody()}
                >
                  Tekrar dene
                </button>
                <Link
                  href={canonicalPath}
                  className="inline-flex items-center gap-1 rounded border border-zinc-300 px-3 py-1.5"
                >
                  Tam haber sayfasını aç <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : null}

          {detail?.bodyHtml ? (
            <div
              className="reader-body mt-6 space-y-3 text-[17px] leading-7"
              data-testid="feed-reader-body"
              dangerouslySetInnerHTML={{ __html: detail.bodyHtml }}
            />
          ) : fetchState === 'loading' ? (
            <div className="mt-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : null}

          <div className="mt-8 border-t border-black/10 pt-4 text-sm">
            <p className="font-medium">Kaynak</p>
            <p className="text-[color:var(--reader-page-muted)]">{detail?.source || publisherName}</p>
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[color:var(--reader-accent)] underline"
              >
                Kaynak bağlantısı <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>

        <footer className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-black/10 bg-[color:var(--reader-page-bg)]/95 px-4 py-3 backdrop-blur-sm">
          <button
            type="button"
            className="rounded-full border border-black/10 px-3 py-1.5 text-sm"
            onClick={onToggleLike}
          >
            {liked ? 'Beğenildi' : 'Beğen'}
            {typeof likeCount === 'number' ? ` · ${likeCount}` : ''}
          </button>
          <button
            type="button"
            className="rounded-full border border-black/10 px-3 py-1.5 text-sm"
            onClick={onToggleSave}
          >
            {saved ? 'Kaydedildi' : 'Kaydet'}
            {typeof saveCount === 'number' ? ` · ${saveCount}` : ''}
          </button>
          <ShareButton title={headline} path={canonicalPath} />
        </footer>
      </div>
    </div>
  )
}

function ShareButton({ title, path }: { title: string; path: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-black/10 px-3 py-1.5 text-sm"
      onClick={() => {
        const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
        if (navigator.share) {
          void navigator.share({ title, url }).catch(() => {})
        } else if (navigator.clipboard) {
          void navigator.clipboard.writeText(url)
        }
      }}
    >
      <Share2 className="h-4 w-4" /> Paylaş
    </button>
  )
}

/** Expose for card-level open gesture (Feed → Reader). */
export function evaluateFeedOpenGesture(opts: {
  dx: number
  dy: number
  startClientX: number
  viewportWidth: number
  velocityX: number
}): { open: boolean; progress: number } {
  if (shouldIgnoreSystemBackEdge(opts.startClientX, opts.viewportWidth)) {
    return { open: false, progress: 0 }
  }
  if (classifyAxisIntent(opts.dx, opts.dy) !== 'horizontal') {
    return { open: false, progress: 0 }
  }
  const progress = feedToReaderProgress(opts.dx, opts.viewportWidth)
  const open = shouldCompleteTransition({
    progress,
    velocityX: Math.max(0, -opts.velocityX),
  })
  return { open, progress }
}
