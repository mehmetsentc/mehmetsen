'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
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
  claimUnownedReaderHistory,
  isFeedReaderHistoryState,
  planReaderHistoryClose,
  planReaderHistoryOpen,
  popReaderHistory,
  pushOwnedReaderHistory,
  replaceUnownedReaderWithFeed,
  type FeedReaderCloseReason,
} from '@/lib/feed/reader/history'
import {
  FEED_READER_CSS_VARS,
  FEED_READER_DURATION_MS,
  FEED_READER_HERO_LOAD_TIMEOUT_MS,
} from '@/lib/feed/reader/tokens'
import {
  applyHeroRuntimeEvent,
  readerHeroShouldBeUnoptimized,
  resolveReaderHero,
  selectReaderHeroCandidate,
  stripDuplicateHeroFromBodyHtml,
  type HeroRuntimeSnapshot,
} from '@/lib/feed/reader/mediaPolicy'
import { getClientAuthToken } from '@/lib/firebase/auth'

export type { FeedReaderCloseReason } from '@/lib/feed/reader/history'

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
  /**
   * When true: history ownership, body fetch, close gestures, chrome lock.
   * When false: visual preview only (Feed→Reader drag / Haberi Oku ramp).
   */
  committed: boolean
  /** Parent-driven reveal 0..1 during interactive open. */
  visualProgress: number
  /** Parent animating Haberi Oku / cancel — Reader mirrors without fighting. */
  progressAnimating?: boolean
  onClose: (reason: FeedReaderCloseReason) => void
  onOpenTelemetry?: () => void
  onCloseTelemetry?: (payload: FeedReaderTelemetryPayload) => void
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
  onLockFeedScroll?: (locked: boolean) => void
}

type FetchState = 'idle' | 'loading' | 'ok' | 'error'
type ImageLoadState = 'pending' | 'ok' | 'error'

let openGeneration = 0

export function FeedArticleReader({
  item,
  committed,
  visualProgress,
  progressAnimating = false,
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
  const closingRef = useRef(false)
  const ownsFeedReturnRef = useRef(false)
  const ignoreNextPopRef = useRef(false)
  const closeReasonRef = useRef<FeedReaderCloseReason>('button')
  const committedLifecycleRef = useRef(false)

  /** Internal progress only while closing or Reader→Feed drag. */
  const [internalProgress, setInternalProgress] = useState<number | null>(null)
  const [animating, setAnimating] = useState(false)
  const [detail, setDetail] = useState<FeedReaderArticleDto | null>(null)
  const [fetchState, setFetchState] = useState<FetchState>('idle')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [imageLoad, setImageLoad] = useState<ImageLoadState>('pending')
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  /** Bumps on article/candidate change + close — stale Image callbacks ignored. */
  const heroEpochRef = useRef(0)
  const activeHeroUrlRef = useRef<string | null>(null)
  const loadTimedOutRef = useRef(false)
  const heroRuntimeRef = useRef<HeroRuntimeSnapshot>({
    articleId: item.articleId,
    url: null,
    epoch: 0,
    imageLoad: 'pending',
    loadTimedOut: false,
  })

  const progress =
    internalProgress !== null ? internalProgress : Math.min(1, Math.max(0, visualProgress))

  const headline = detail?.headline || item.headline
  const summary = detail?.summary ?? item.summary
  const feedImage = item.image
  const detailImage = detail?.image
  const imageCaption = detail?.imageCaption ?? null
  const publisherName = detail?.publisher?.name || item.publisher?.name || 'Kaynak'
  const category = detail?.category || item.category
  const sourceUrl = detail?.sourceUrl
  const canonicalPath = detail?.canonicalPath || `/haber/${item.slug}`
  const readingMins = detail?.readingTimeMinutes

  const bodySettled = fetchState === 'ok' || fetchState === 'error'

  const hero = useMemo(
    () =>
      resolveReaderHero({
        feedImage,
        detailImage,
        detailCaption: imageCaption,
        bodyHtml: detail?.bodyHtml,
        bodySettled,
        imageLoad,
        loadTimedOut,
      }),
    [
      feedImage,
      detailImage,
      imageCaption,
      detail?.bodyHtml,
      bodySettled,
      imageLoad,
      loadTimedOut,
    ]
  )

  const bodyHtmlRendered = useMemo(
    () => stripDuplicateHeroFromBodyHtml(detail?.bodyHtml ?? null, hero.suppressBodySrc),
    [detail?.bodyHtml, hero.suppressBodySrc]
  )

  const heroCandidate = selectReaderHeroCandidate(feedImage, detailImage)

  const commitHeroFlags = useCallback(
    (flags: Pick<HeroRuntimeSnapshot, 'imageLoad' | 'loadTimedOut'>) => {
      heroRuntimeRef.current.imageLoad = flags.imageLoad
      heroRuntimeRef.current.loadTimedOut = flags.loadTimedOut
      loadTimedOutRef.current = flags.loadTimedOut
      setImageLoad(flags.imageLoad)
      setLoadTimedOut(flags.loadTimedOut)
    },
    []
  )

  useEffect(() => {
    const epoch = ++heroEpochRef.current
    loadTimedOutRef.current = false
    activeHeroUrlRef.current = heroCandidate
    heroRuntimeRef.current = {
      articleId: item.articleId,
      url: heroCandidate,
      epoch,
      imageLoad: 'pending',
      loadTimedOut: false,
    }
    setImageLoad('pending')
    setLoadTimedOut(false)
    if (!heroCandidate) return
    const t = window.setTimeout(() => {
      commitHeroFlags(
        applyHeroRuntimeEvent(heroRuntimeRef.current, {
          type: 'timeout',
          articleId: item.articleId,
          url: heroCandidate,
          epoch,
        })
      )
    }, FEED_READER_HERO_LOAD_TIMEOUT_MS)
    return () => {
      window.clearTimeout(t)
    }
  }, [commitHeroFlags, heroCandidate, item.articleId])

  const acceptHeroLoad = useCallback((url: string, result: ImageLoadState) => {
    if (result !== 'ok' && result !== 'error') return
    commitHeroFlags(
      applyHeroRuntimeEvent(heroRuntimeRef.current, {
        type: result,
        articleId: item.articleId,
        url,
        epoch: heroEpochRef.current,
      })
    )
  }, [commitHeroFlags, item.articleId])

  // Close / unmount: invalidate in-flight hero callbacks + timer epoch.
  useEffect(() => {
    return () => {
      heroEpochRef.current += 1
      activeHeroUrlRef.current = null
      heroRuntimeRef.current = {
        ...heroRuntimeRef.current,
        epoch: heroEpochRef.current,
        url: null,
      }
    }
  }, [])

  const finishCloseUi = useCallback(
    (reason: FeedReaderCloseReason) => {
      const dwellMs = dwellRef.current.close()
      onLockFeedScroll?.(false)
      document.documentElement.classList.remove('smart-feed-reader-open')
      document.body.classList.remove('smart-feed-reader-open')
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
      ownsFeedReturnRef.current = false
      closingRef.current = false
      committedLifecycleRef.current = false
      setInternalProgress(null)
      onClose(reason)
    },
    [item, onClose, onCloseTelemetry, onLockFeedScroll]
  )

  const beginClose = useCallback(
    (reason: FeedReaderCloseReason) => {
      if (!committed || closingRef.current) return
      closingRef.current = true
      closeReasonRef.current = reason

      const plan = planReaderHistoryClose({
        reason,
        ownsFeedReturn: ownsFeedReturnRef.current,
      })
      if (plan === 'history_back') {
        ignoreNextPopRef.current = true
        ownsFeedReturnRef.current = false
        popReaderHistory()
      } else if (plan === 'replace_unowned_feed') {
        ownsFeedReturnRef.current = false
        replaceUnownedReaderWithFeed()
      }

      setAnimating(true)
      setInternalProgress(0)
      window.setTimeout(() => {
        setAnimating(false)
        finishCloseUi(reason)
      }, reducedMotion ? 0 : FEED_READER_DURATION_MS)
    },
    [committed, finishCloseUi, reducedMotion]
  )

  const beginCloseRef = useRef(beginClose)
  beginCloseRef.current = beginClose
  const onLockFeedScrollRef = useRef(onLockFeedScroll)
  onLockFeedScrollRef.current = onLockFeedScroll
  const onOpenTelemetryRef = useRef(onOpenTelemetry)
  onOpenTelemetryRef.current = onOpenTelemetry

  const snapReaderOpen = useCallback(() => {
    if (closingRef.current) return
    setAnimating(true)
    setInternalProgress(1)
    window.setTimeout(() => {
      setAnimating(false)
      setInternalProgress(null)
    }, reducedMotion ? 0 : FEED_READER_DURATION_MS)
  }, [reducedMotion])

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

  const loadBodyRef = useRef(loadBody)
  loadBodyRef.current = loadBody

  useEffect(() => {
    setReducedMotion(prefersReducedMotion())
  }, [])

  // Preview reset when session item changes without commit.
  useEffect(() => {
    if (committed) return
    setDetail(null)
    setFetchState('idle')
    abortRef.current?.abort()
    setInternalProgress(null)
    closingRef.current = false
  }, [committed, item.articleId])

  // Committed lifecycle — push history exactly once; never re-push on callback churn.
  useEffect(() => {
    if (!committed) {
      if (committedLifecycleRef.current) {
        // Unexpected un-commit — soft teardown without history.back.
        onLockFeedScrollRef.current?.(false)
        document.documentElement.classList.remove('smart-feed-reader-open')
        document.body.classList.remove('smart-feed-reader-open')
        committedLifecycleRef.current = false
      }
      return
    }

    if (committedLifecycleRef.current) return
    committedLifecycleRef.current = true

    openGeneration += 1
    const gen = openGeneration
    closingRef.current = false
    ignoreNextPopRef.current = false
    depthSeenRef.current = new Set()
    depthMaxRef.current = 0
    dwellRef.current.open()
    onLockFeedScrollRef.current?.(true)
    document.documentElement.classList.add('smart-feed-reader-open')
    document.body.classList.add('smart-feed-reader-open')

    const openPlan = planReaderHistoryOpen({
      slug: item.slug,
      search: typeof window !== 'undefined' ? window.location.search : '',
      historyState: typeof window !== 'undefined' ? window.history.state : null,
    })
    if (openPlan === 'push_owned') {
      pushOwnedReaderHistory({ slug: item.slug, articleId: item.articleId })
      ownsFeedReturnRef.current = true
    } else if (openPlan === 'claim_unowned_direct') {
      claimUnownedReaderHistory({ slug: item.slug, articleId: item.articleId })
      ownsFeedReturnRef.current = false
    } else {
      ownsFeedReturnRef.current = true
    }

    setInternalProgress(null)
    if (!openedRef.current) {
      openedRef.current = true
      onOpenTelemetryRef.current?.()
    }
    void loadBodyRef.current()

    const onVis = () => {
      if (gen !== openGeneration) return
      dwellRef.current.setDocumentVisible(document.visibilityState === 'visible')
    }
    const onPop = (ev: PopStateEvent) => {
      if (gen !== openGeneration) return
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false
        return
      }
      if (isFeedReaderHistoryState(ev.state) && ev.state.ownsFeedReturn) return
      beginCloseRef.current('history')
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') beginCloseRef.current('escape')
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      if (ownsFeedReturnRef.current && !closingRef.current) {
        ignoreNextPopRef.current = true
        ownsFeedReturnRef.current = false
        popReaderHistory()
      }
    }
  }, [committed, item.slug, item.articleId])

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
    if (!committed || closingRef.current) return
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
    if (!committed || closingRef.current) return
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
    setInternalProgress(Math.min(1, Math.max(0.05, p)))
    d.lastX = e.clientX
    d.lastT = performance.now()
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    if (!committed || closingRef.current) return
    if (!d || d.pointerId !== e.pointerId || d.axis !== 'horizontal') return
    const dx = e.clientX - d.startX
    const dt = Math.max(1, performance.now() - d.lastT)
    const velocity = (e.clientX - d.lastX) / dt
    const closeProgress = readerToFeedProgress(dx, window.innerWidth)
    const complete = shouldCompleteTransition({
      progress: closeProgress,
      velocityX: Math.max(0, velocity),
    })
    if (complete) beginClose('gesture')
    else snapReaderOpen()
  }

  const onPointerCancel = () => {
    dragRef.current = null
    if (!committed || closingRef.current) return
    snapReaderOpen()
  }

  if (progress <= 0.001 && !committed) return null

  const transitionOn =
    (animating || progressAnimating) && !reducedMotion && internalProgress === null
      ? `transform ${FEED_READER_DURATION_MS}ms ease, opacity ${FEED_READER_DURATION_MS}ms ease`
      : animating && !reducedMotion
        ? `transform ${FEED_READER_DURATION_MS}ms ease, opacity ${FEED_READER_DURATION_MS}ms ease`
        : 'none'

  const styleVars = {
    ...FEED_READER_CSS_VARS,
    transform: reducedMotion
      ? undefined
      : `translate3d(${(1 - progress) * 100}%, 0, 0)`,
    opacity: reducedMotion ? (progress > 0.5 ? 1 : 0) : 0.55 + progress * 0.45,
    transition: transitionOn,
  } as CSSProperties

  const metaBits = [
    category,
    publisherName,
    item.publishedAt
      ? new Date(item.publishedAt).toLocaleString('tr-TR', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null,
    readingMins ? `${readingMins} dk` : null,
  ].filter(Boolean)

  return (
    <div
      className={cn(
        'fixed inset-0 z-[130] flex justify-center',
        committed ? 'pointer-events-auto' : 'pointer-events-none'
      )}
      data-testid="feed-article-reader"
      data-reader-committed={committed ? '1' : '0'}
      data-reader-progress={progress.toFixed(2)}
      role="dialog"
      aria-modal={committed}
      aria-labelledby={titleId}
      style={{ background: progress > 0.02 ? 'rgba(0,0,0,0.55)' : 'transparent' }}
    >
      <div
        className="feed-reader-article relative flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden shadow-2xl md:my-0"
        style={{
          ...styleVars,
          background: 'var(--reader-page-bg)',
          color: 'var(--reader-page-text)',
          boxShadow: progress > 0.2 ? `-12px 0 28px var(--reader-fold-shadow)` : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <header
          className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5"
          style={{ background: 'var(--reader-page-bg)' }}
        >
          <button
            type="button"
            className="rounded-full p-2 text-[color:var(--reader-page-text)] hover:bg-white/10"
            aria-label="Akışa dön"
            data-testid="feed-reader-close"
            onClick={() => beginClose('button')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--reader-accent)]">
              {category || 'Haber'}
            </p>
            <p className="truncate text-sm font-medium text-[color:var(--reader-page-muted)]">
              {publisherName}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-[color:var(--reader-page-text)] hover:bg-white/10"
            aria-label="Kaydet"
            onClick={onToggleSave}
          >
            <Bookmark
              className={cn('h-5 w-5', saved && 'fill-current text-[color:var(--reader-accent)]')}
            />
          </button>
          <button
            type="button"
            className="rounded-full p-2 text-[color:var(--reader-page-text)] hover:bg-white/10"
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
          style={{ background: 'var(--reader-page-bg)' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--reader-page-muted)]">
            {metaBits.join(' · ')}
          </p>
          <h1
            id={titleId}
            className="mt-2 break-words font-serif text-[1.45rem] font-bold leading-[1.22] tracking-tight text-[color:var(--reader-page-text)] sm:text-[1.65rem]"
            style={{ fontFamily: 'var(--font-serif-display, Georgia, serif)' }}
          >
            {headline}
          </h1>

          {summary ? (
            <p
              className="mt-3 break-words border-l-[3px] border-[color:var(--reader-accent)] pl-3 text-[1.02rem] font-semibold leading-snug text-[color:var(--reader-page-text)]"
              data-testid="feed-reader-spot"
            >
              {summary}
            </p>
          ) : null}

          {hero.state === 'LOADING' && hero.url ? (
            <div
              className="relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-md bg-[color:var(--reader-page-elevated)]"
              data-testid="feed-reader-hero-loading"
              aria-busy="true"
            >
              <Image
                src={hero.url}
                alt=""
                fill
                className="object-cover opacity-0"
                sizes="(max-width: 512px) 100vw, 512px"
                priority
                unoptimized={readerHeroShouldBeUnoptimized(hero.url)}
                onLoad={() => acceptHeroLoad(hero.url!, 'ok')}
                onError={() => acceptHeroLoad(hero.url!, 'error')}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[color:var(--reader-page-muted)]" />
              </div>
            </div>
          ) : null}

          {hero.state === 'VALID_MEDIA' && hero.url ? (
            <figure
              className="relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-md bg-[color:var(--reader-page-elevated)]"
              data-testid="feed-reader-hero"
            >
              <Image
                src={hero.url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 512px) 100vw, 512px"
                priority
                unoptimized={readerHeroShouldBeUnoptimized(hero.url)}
                onLoad={() => acceptHeroLoad(hero.url!, 'ok')}
                onError={() => acceptHeroLoad(hero.url!, 'error')}
              />
              {hero.caption ? (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-xs text-white/90">
                  {hero.caption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          {hero.state === 'FAILED_MEDIA' ? (
            <div
              className="mt-4 rounded-md border border-white/10 bg-[color:var(--reader-page-elevated)] px-3 py-2 text-xs text-[color:var(--reader-page-muted)]"
              data-testid="feed-reader-hero-failed"
            >
              Görsel yüklenemedi
            </div>
          ) : null}

          {/* NO_MEDIA: no hero container */}

          {fetchState === 'loading' && !detail?.bodyHtml ? (
            <div className="mt-5 space-y-2.5" aria-busy="true" data-testid="feed-reader-body-skeleton">
              <div className="h-2.5 w-full animate-pulse rounded bg-white/10" />
              <div className="h-2.5 w-[92%] animate-pulse rounded bg-white/10" />
              <div className="h-2.5 w-[85%] animate-pulse rounded bg-white/10" />
              <div className="h-2.5 w-[88%] animate-pulse rounded bg-white/10" />
            </div>
          ) : null}

          {fetchState === 'error' ? (
            <div className="mt-5 rounded-md border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-100">
              <p>Haber ayrıntıları yüklenemedi.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded bg-[color:var(--reader-accent)] px-3 py-1.5 text-white"
                  onClick={() => void loadBody()}
                >
                  Tekrar dene
                </button>
                <Link
                  href={canonicalPath}
                  className="inline-flex items-center gap-1 rounded border border-white/20 px-3 py-1.5"
                >
                  Tam haber sayfasını aç <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : null}

          {bodyHtmlRendered ? (
            <div
              className="feed-reader-body reader-body mt-5"
              data-testid="feed-reader-body"
              dangerouslySetInnerHTML={{ __html: bodyHtmlRendered }}
            />
          ) : fetchState === 'loading' && committed ? (
            <div className="mt-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[color:var(--reader-page-muted)]" />
            </div>
          ) : null}

          <aside
            className="mt-8 rounded-lg border border-white/10 bg-[color:var(--reader-page-elevated)] p-4 text-sm"
            data-testid="feed-reader-source"
            aria-label="Kaynak"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--reader-page-muted)]">
              Kaynak
            </p>
            <p className="mt-1 font-medium text-[color:var(--reader-page-text)]">
              {detail?.source || publisherName}
            </p>
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
          </aside>
        </div>

        <footer
          className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          style={{ background: 'color-mix(in srgb, var(--reader-page-bg) 94%, transparent)' }}
          data-testid="feed-reader-footer"
        >
          <button
            type="button"
            className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-[color:var(--reader-page-text)]"
            onClick={onToggleLike}
          >
            {liked ? 'Beğenildi' : 'Beğen'}
            {typeof likeCount === 'number' ? ` · ${likeCount}` : ''}
          </button>
          <button
            type="button"
            className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-[color:var(--reader-page-text)]"
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
      className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-sm text-[color:var(--reader-page-text)]"
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
