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
  beginCloseTransaction,
  canHistoryBackForOpen,
  claimUnownedReaderHistory,
  createReaderOpenId,
  ensureFeedOwnerUrl,
  finishCloseTransaction,
  planReaderHistoryClose,
  planReaderHistoryOpen,
  parseReaderSlugFromSearch,
  popReaderHistory,
  pushOwnedReaderHistory,
  readReaderHistoryState,
  replaceUnownedReaderWithFeed,
  resolveFeedOwnerHistorySync,
  type FeedReaderCloseReason,
  type ReaderCloseTransactionPhase,
  type ReaderHistoryClosePlan,
} from '@/lib/feed/reader/history'
import {
  armFeedOwnerRescue,
  clearFeedOwnerRescue,
} from '@/lib/feed/reader/feedOwnerRescue'
import {
  isReaderNavTraceEnabled,
  markReaderOpenTiming,
  nearSystemBackEdge,
  recordReaderNavTrace,
} from '@/lib/feed/reader/navTrace'
import {
  FEED_READER_CSS_VARS,
  FEED_READER_DURATION_MS,
  FEED_READER_EASING,
  FEED_READER_HERO_LOAD_TIMEOUT_MS,
} from '@/lib/feed/reader/tokens'
import { FEED_READER_SURFACE_CLASS, FEED_V2_CHROME_CSS_VARS } from '@/lib/feed/reader/feedChrome'
import {
  applyHeroRuntimeEvent,
  applyHeroTimeoutEvent,
  isFeedKnownGoodHero,
  readerHeroShouldBeUnoptimized,
  resolveReaderHero,
  selectReaderHeroCandidate,
  stripDuplicateHeroFromBodyHtml,
  type HeroRuntimeSnapshot,
} from '@/lib/feed/reader/mediaPolicy'
import {
  formatReaderCategoryLabel,
  looksLikeUpstreamTruncation,
  pickFullReaderCopy,
} from '@/lib/feed/reader/presentationCopy'
import { getClientAuthToken } from '@/lib/firebase/auth'
import { markReaderReturnCoachLearned } from '@/lib/feed/reader/readerReturnCoach'
import { ReaderReturnCoach } from '@/components/feed/smart/ReaderReturnCoach'

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
  /**
   * Keep Feed underlay transform in sync during Reader→Feed drag / close ramp.
   * Without this, parent stays at progress=1 while Reader animates internally.
   */
  onVisualProgress?: (progress: number, opts?: { animating?: boolean }) => void
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
  feedSessionId?: string | null
  openSource?: 'swipe' | 'swipe_affordance' | 'haberi_oku' | 'unknown'
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
  onVisualProgress,
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
  feedSessionId = null,
  openSource = 'unknown',
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
  const readerOpenIdRef = useRef<string | null>(null)
  const closePhaseRef = useRef<ReaderCloseTransactionPhase>('closed')
  const ignoreNextPopRef = useRef(false)
  const closeReasonRef = useRef<FeedReaderCloseReason>('button')
  /** History mutation deferred until close animation ends — keeps Feed as sole underlay. */
  const pendingHistoryPlanRef = useRef<ReaderHistoryClosePlan | null>(null)
  /** Safari/system pop during closing — must cancel deferred history.back(). */
  const foreignPopDuringCloseRef = useRef(false)
  const committedLifecycleRef = useRef(false)

  const clearReaderChromeLock = () => {
    document.documentElement.classList.remove('smart-feed-reader-open')
    document.body.classList.remove('smart-feed-reader-open')
  }

  // Lock site chrome for the full open ramp (not only after commit) so Global Nav
  // cannot leak beside a half-turned Reader page on iOS.
  useEffect(() => {
    document.documentElement.classList.add('smart-feed-reader-open')
    document.body.classList.add('smart-feed-reader-open')
    return () => {
      clearReaderChromeLock()
    }
  }, [])

  const onVisualProgressRef = useRef(onVisualProgress)
  onVisualProgressRef.current = onVisualProgress

  const syncVisualProgress = useCallback((next: number, animating?: boolean) => {
    onVisualProgressRef.current?.(next, animating === undefined ? undefined : { animating })
  }, [])

  /** Internal progress only while closing or Reader→Feed drag. */
  const [internalProgress, setInternalProgress] = useState<number | null>(null)
  const [animating, setAnimating] = useState(false)
  const [detail, setDetail] = useState<FeedReaderArticleDto | null>(null)
  const [fetchState, setFetchState] = useState<FetchState>('idle')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [imageLoad, setImageLoad] = useState<ImageLoadState>('pending')
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  /** Reactive close flag for return coach (closingRef alone does not re-render). */
  const [coachClosing, setCoachClosing] = useState(false)
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
  const progressRef = useRef(progress)
  progressRef.current = progress

  const headline = pickFullReaderCopy(detail?.headline, item.headline) || item.headline
  const summary = pickFullReaderCopy(detail?.summary, item.summary)
  const headlineUpstreamCut = looksLikeUpstreamTruncation(headline)
  const spotUpstreamCut = looksLikeUpstreamTruncation(summary)
  const feedImage = item.image
  const detailImage = detail?.image
  const imageCaption = detail?.imageCaption ?? null
  const publisherName = detail?.publisher?.name || item.publisher?.name || 'Kaynak'
  const category = detail?.category || item.category
  const categoryLabel = formatReaderCategoryLabel(category)
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
    const feedKnownGood = isFeedKnownGoodHero(feedImage, heroCandidate)
    const t = window.setTimeout(() => {
      commitHeroFlags(
        applyHeroTimeoutEvent(
          heroRuntimeRef.current,
          {
            type: 'timeout',
            articleId: item.articleId,
            url: heroCandidate,
            epoch,
          },
          { feedKnownGood }
        )
      )
    }, FEED_READER_HERO_LOAD_TIMEOUT_MS)
    return () => {
      window.clearTimeout(t)
    }
  }, [commitHeroFlags, feedImage, heroCandidate, item.articleId])

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
    if (result === 'ok' && readerOpenIdRef.current) {
      markReaderOpenTiming(readerOpenIdRef.current, 'heroResolvedAt')
    }
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

      // Chrome lock MUST clear before any history mutation — otherwise HOME can
      // paint while smart-feed-reader-open still hides MobileNav / top chrome.
      clearReaderChromeLock()

      const planned = pendingHistoryPlanRef.current
      pendingHistoryPlanRef.current = null
      const foreignPop = foreignPopDuringCloseRef.current
      foreignPopDuringCloseRef.current = false

      const locBefore =
        typeof window !== 'undefined'
          ? { pathname: window.location.pathname, search: window.location.search }
          : { pathname: '/feed-v2', search: '' }
      const stateBefore = typeof window !== 'undefined' ? window.history.state : null
      const ownsFeedReturn = readReaderHistoryState(stateBefore)?.ownsFeedReturn ?? null

      const plan = resolveFeedOwnerHistorySync({
        planned: planned ?? 'none',
        foreignPopDuringClose: foreignPop,
        pathname: locBefore.pathname,
        search: locBefore.search,
      })

      recordReaderNavTrace({
        type: 'history_action_executed',
        pathname: locBefore.pathname,
        search: locBefore.search,
        historyLength: typeof window !== 'undefined' ? window.history.length : 0,
        readerOpenId: readerOpenIdRef.current,
        feedSessionId,
        readerMounted: true,
        feedMounted: true,
        readerState: 'closing',
        closePhase: 'closing',
        closeSource:
          reason === 'history'
            ? 'popstate'
            : reason === 'gesture'
              ? 'swipe'
              : reason === 'escape'
                ? 'escape'
                : 'ui',
        historyPlanRequested: planned,
        historyPlanExecuted: plan,
        foreignPopDuringClose: foreignPop,
        ownsFeedReturn,
        articleId: item.articleId,
        category: item.category,
        source: 'reader',
      })

      if (plan === 'history_back') {
        ignoreNextPopRef.current = true
        armFeedOwnerRescue()
        popReaderHistory()
      } else if (plan === 'replace_unowned_feed') {
        replaceUnownedReaderWithFeed()
        clearFeedOwnerRescue()
      } else {
        clearFeedOwnerRescue()
      }

      const locAfter =
        typeof window !== 'undefined'
          ? { pathname: window.location.pathname, search: window.location.search }
          : { pathname: '/feed-v2', search: '' }

      if (locAfter.pathname === '/' || locAfter.pathname === '') {
        recordReaderNavTrace({
          type: 'HOME_ESCAPE_CAUSE',
          pathname: locAfter.pathname,
          search: locAfter.search,
          historyLength: typeof window !== 'undefined' ? window.history.length : 0,
          readerOpenId: readerOpenIdRef.current,
          feedSessionId,
          readerMounted: true,
          feedMounted: false,
          readerState: 'closing',
          closeSource:
            reason === 'history'
              ? 'popstate'
              : reason === 'gesture'
                ? 'swipe'
                : reason === 'escape'
                  ? 'escape'
                  : 'ui',
          historyPlanRequested: planned,
          historyPlanExecuted: plan,
          foreignPopDuringClose: foreignPop,
          ownsFeedReturn,
          pathnameAfter: locAfter.pathname,
          prevPathname: locBefore.pathname,
          leftFeedToHome: true,
          articleId: item.articleId,
          category: item.category,
          source: 'reader',
          destination: '/feed-v2',
        })
        // Soft URL repair — MainLayout FeedOwnerRescue also router.replace when armed.
        ensureFeedOwnerUrl({ feedHref: '/feed-v2' })
      } else if (locAfter.pathname.startsWith('/feed-v2')) {
        clearFeedOwnerRescue()
        if (parseReaderSlugFromSearch(locAfter.search)) {
          replaceUnownedReaderWithFeed()
        }
      } else {
        ensureFeedOwnerUrl({ feedHref: '/feed-v2' })
      }

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
      closingRef.current = false
      setCoachClosing(false)
      committedLifecycleRef.current = false
      closePhaseRef.current = finishCloseTransaction()
      readerOpenIdRef.current = null
      setInternalProgress(null)
      onClose(reason)
    },
    [feedSessionId, item, onClose, onCloseTelemetry, onLockFeedScroll]
  )

  const beginClose = useCallback(
    (reason: FeedReaderCloseReason) => {
      if (!committed) return
      const nextPhase = beginCloseTransaction(closePhaseRef.current)
      if (!nextPhase) return
      closePhaseRef.current = nextPhase
      closingRef.current = true
      setCoachClosing(true)
      closeReasonRef.current = reason

      const openId = readerOpenIdRef.current
      const closeTxId = openId ? `close_${openId}` : `close_${Date.now().toString(36)}`
      const currentState = typeof window !== 'undefined' ? window.history.state : null
      // Ownership is evaluated against CURRENT history.state only — never React booleans.
      // phase 'active' here means "this transaction is allowed to act once"; ref is already closing.
      const plan = planReaderHistoryClose({
        reason,
        currentState,
        readerOpenId: openId,
        feedSessionId,
        phase: 'active',
      })
      const loc =
        typeof window !== 'undefined'
          ? { pathname: window.location.pathname, search: window.location.search }
          : { pathname: '/feed-v2', search: '' }
      recordReaderNavTrace({
        type: plan === 'history_back' ? 'history_back_request' : plan === 'none' ? 'popstate' : 'replaceState',
        pathname: loc.pathname,
        search: loc.search,
        historyLength: typeof window !== 'undefined' ? window.history.length : 0,
        readerOpenId: openId,
        feedSessionId,
        readerMounted: true,
        feedMounted: true,
        readerState: 'closing',
        closePhase: nextPhase,
        closeSource:
          reason === 'history'
            ? 'popstate'
            : reason === 'gesture'
              ? 'swipe'
              : reason === 'escape'
                ? 'escape'
                : 'ui',
        articleId: item.articleId,
        category: item.category,
        ownsReaderEntry: canHistoryBackForOpen({
          currentState,
          readerOpenId: openId ?? '',
          feedSessionId,
          phase: 'active',
        }),
        ownsFeedReturn: readReaderHistoryState(currentState)?.ownsFeedReturn ?? null,
        readerOpenIdInState: readReaderHistoryState(currentState)?.readerOpenId ?? null,
        historyPlanRequested: plan,
        source: 'reader',
        readDecision: closeTxId,
      })
      // Defer history.back / replace until finishCloseUi — interactive close must
      // keep Feed as the only underlying page surface (never HOME mid-swipe).
      // Re-resolve at finish via resolveFeedOwnerHistorySync (foreign pop / URL).
      pendingHistoryPlanRef.current = plan
      foreignPopDuringCloseRef.current = false

      // LEFT gesture learning only — back arrow / popstate must not mark learned.
      if (reason === 'gesture') markReaderReturnCoachLearned()

      // Match open ramp: enable transition, then drop progress on next frame
      // so WebKit actually interpolates (same-tick 1→0 skips the close animation).
      const from = progressRef.current
      setInternalProgress(from)
      setAnimating(true)
      syncVisualProgress(from, true)
      const runCloseAnim = () => {
        setInternalProgress(0)
        syncVisualProgress(0, true)
        window.setTimeout(() => {
          setAnimating(false)
          finishCloseUi(reason)
        }, reducedMotion ? 0 : FEED_READER_DURATION_MS)
      }
      if (reducedMotion) runCloseAnim()
      else requestAnimationFrame(() => requestAnimationFrame(runCloseAnim))
    },
    [committed, feedSessionId, finishCloseUi, item.articleId, item.category, reducedMotion, syncVisualProgress]
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
    syncVisualProgress(1, true)
    window.setTimeout(() => {
      setAnimating(false)
      setInternalProgress(null)
      syncVisualProgress(1, false)
    }, reducedMotion ? 0 : FEED_READER_DURATION_MS)
  }, [reducedMotion, syncVisualProgress])

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
      if (readerOpenIdRef.current) {
        markReaderOpenTiming(readerOpenIdRef.current, 'bodyAvailableAt')
      }
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
    setCoachClosing(false)
  }, [committed, item.articleId])

  // Committed lifecycle — push history exactly once; never re-push on callback churn.
  useEffect(() => {
    if (!committed) {
      if (committedLifecycleRef.current) {
        // Unexpected un-commit — soft teardown without history.back.
        onLockFeedScrollRef.current?.(false)
        clearReaderChromeLock()
        committedLifecycleRef.current = false
      }
      return
    }

    if (committedLifecycleRef.current) return
    committedLifecycleRef.current = true

    openGeneration += 1
    const gen = openGeneration
    closingRef.current = false
    setCoachClosing(false)
    ignoreNextPopRef.current = false
    foreignPopDuringCloseRef.current = false
    pendingHistoryPlanRef.current = null
    closePhaseRef.current = 'active'
    const openId = createReaderOpenId()
    readerOpenIdRef.current = openId
    depthSeenRef.current = new Set()
    depthMaxRef.current = 0
    dwellRef.current.open()
    onLockFeedScrollRef.current?.(true)
    document.documentElement.classList.add('smart-feed-reader-open')
    document.body.classList.add('smart-feed-reader-open')

    const historyState = typeof window !== 'undefined' ? window.history.state : null
    const openPlan = planReaderHistoryOpen({
      slug: item.slug,
      search: typeof window !== 'undefined' ? window.location.search : '',
      historyState,
      readerOpenId: openId,
    })
    if (openPlan === 'push_owned') {
      pushOwnedReaderHistory({
        slug: item.slug,
        articleId: item.articleId,
        readerOpenId: openId,
        feedSessionId,
      })
    } else if (openPlan === 'claim_unowned_direct') {
      claimUnownedReaderHistory({
        slug: item.slug,
        articleId: item.articleId,
        readerOpenId: openId,
        feedSessionId,
      })
    }

    recordReaderNavTrace({
      type: openPlan === 'push_owned' ? 'pushState' : openPlan === 'claim_unowned_direct' ? 'replaceState' : 'reader_open',
      pathname: typeof window !== 'undefined' ? window.location.pathname : '/feed-v2',
      search: typeof window !== 'undefined' ? window.location.search : '',
      historyLength: typeof window !== 'undefined' ? window.history.length : 0,
      readerOpenId: openId,
      feedSessionId,
      readerMounted: true,
      feedMounted: true,
      readerState: 'open',
      openSource,
      articleId: item.articleId,
      category: item.category,
    })
    if (isReaderNavTraceEnabled()) {
      markReaderOpenTiming(openId, 'stateOpenAt')
      requestAnimationFrame(() => {
        if (readerOpenIdRef.current === openId) {
          markReaderOpenTiming(openId, 'firstFrameAt')
        }
      })
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
    const onPop = () => {
      if (gen !== openGeneration) return
      // While closing: Safari/system may already have consumed the Reader entry.
      // Cancel deferred history.back() so we do not skip Feed → HOME.
      if (closePhaseRef.current === 'closing') {
        foreignPopDuringCloseRef.current = true
        pendingHistoryPlanRef.current = 'none'
        recordReaderNavTrace({
          type: 'popstate',
          pathname: typeof window !== 'undefined' ? window.location.pathname : '/feed-v2',
          search: typeof window !== 'undefined' ? window.location.search : '',
          historyLength: typeof window !== 'undefined' ? window.history.length : 0,
          readerOpenId: readerOpenIdRef.current,
          feedSessionId,
          readerMounted: true,
          feedMounted: true,
          readerState: 'closing',
          closePhase: 'closing',
          closeSource: 'browser_back',
          foreignPopDuringClose: true,
          historyPlanExecuted: 'none',
          source: 'reader',
          articleId: item.articleId,
          category: item.category,
        })
        return
      }
      if (closePhaseRef.current !== 'active') return
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false
        return
      }
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
      // Always clear chrome lock on unmount — prevent HOME navbar leak.
      clearReaderChromeLock()
      recordReaderNavTrace({
        type: 'reader_cleanup',
        pathname: typeof window !== 'undefined' ? window.location.pathname : '/feed-v2',
        search: typeof window !== 'undefined' ? window.location.search : '',
        historyLength: typeof window !== 'undefined' ? window.history.length : 0,
        readerOpenId: readerOpenIdRef.current,
        feedSessionId,
        readerMounted: false,
        feedMounted: true,
        readerState: closePhaseRef.current === 'closed' ? 'closed' : 'closing',
        articleId: item.articleId,
        category: item.category,
      })
      // Cleanup must never history.back() — only the close transaction may.
    }
  }, [committed, feedSessionId, item.articleId, item.slug, openSource])

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
    if (shouldIgnoreSystemBackEdge(e.clientX, window.innerWidth)) {
      recordReaderNavTrace({
        type: 'gesture_ignored_ios_edge',
        pathname: typeof window !== 'undefined' ? window.location.pathname : '/feed-v2',
        search: typeof window !== 'undefined' ? window.location.search : '',
        historyLength: typeof window !== 'undefined' ? window.history.length : 0,
        readerOpenId: readerOpenIdRef.current,
        feedSessionId,
        readerMounted: true,
        feedMounted: true,
        readerState: 'open',
        closeSource: 'swipe',
        startClientX: e.clientX,
        viewportWidth: window.innerWidth,
        nearSystemBackEdge: true,
        source: 'reader',
      })
      return
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastT: performance.now(),
      axis: 'none',
    }
    // Capture only after horizontal lock — early capture steals Akışa Dön / chrome taps on iOS.
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
      // Akışa Dön: finger LEFT only (negative dx).
      if (dx >= 0) return
      d.axis = 'horizontal'
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      } catch {
        // Non-fatal
      }
    }
    if (d.axis !== 'horizontal') return
    e.preventDefault()
    const p = 1 - readerToFeedProgress(dx, window.innerWidth)
    const next = Math.min(1, Math.max(0.05, p))
    setInternalProgress(next)
    syncVisualProgress(next, false)
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
      velocityX: Math.max(0, -velocity),
    })
    if (complete) {
      recordReaderNavTrace({
        type: 'reader_close',
        pathname: typeof window !== 'undefined' ? window.location.pathname : '/feed-v2',
        search: typeof window !== 'undefined' ? window.location.search : '',
        historyLength: typeof window !== 'undefined' ? window.history.length : 0,
        readerOpenId: readerOpenIdRef.current,
        feedSessionId,
        readerMounted: true,
        feedMounted: true,
        readerState: 'closing',
        closeSource: 'swipe',
        startClientX: d.startX,
        viewportWidth: window.innerWidth,
        nearSystemBackEdge: nearSystemBackEdge(d.startX, window.innerWidth),
        source: 'reader',
      })
      beginClose('gesture')
    } else snapReaderOpen()
  }

  const onPointerCancel = () => {
    const hadHorizontal = dragRef.current?.axis === 'horizontal'
    const startX = dragRef.current?.startX ?? null
    dragRef.current = null
    if (!committed || closingRef.current) return
    recordReaderNavTrace({
      type: 'close_blocked',
      pathname: typeof window !== 'undefined' ? window.location.pathname : '/feed-v2',
      search: typeof window !== 'undefined' ? window.location.search : '',
      historyLength: typeof window !== 'undefined' ? window.history.length : 0,
      readerOpenId: readerOpenIdRef.current,
      feedSessionId,
      readerMounted: true,
      feedMounted: true,
      readerState: 'open',
      closeSource: 'swipe',
      startClientX: startX,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : null,
      source: 'reader',
      fallbackReason: hadHorizontal ? 'pointercancel_after_horizontal' : 'pointercancel',
    })
    // pointercancel must NEVER complete a close — snap open only.
    snapReaderOpen()
  }

  // Keep shell mounted while open/close CSS is armed — Haberi Oku starts at
  // progress≈0; returning null here made the first paint happen at progress=1
  // (hard cut, no page-turn) on WebKit/iOS.
  if (progress <= 0.001 && !committed && !progressAnimating && !animating) return null

  const transitionOn =
    (animating || progressAnimating) && !reducedMotion && internalProgress === null
      ? `transform ${FEED_READER_DURATION_MS}ms ${FEED_READER_EASING}, opacity ${FEED_READER_DURATION_MS}ms ${FEED_READER_EASING}`
      : animating && !reducedMotion
        ? `transform ${FEED_READER_DURATION_MS}ms ${FEED_READER_EASING}, opacity ${FEED_READER_DURATION_MS}ms ${FEED_READER_EASING}`
        : 'none'

  const styleVars = {
    ...FEED_READER_CSS_VARS,
    // Reader enters from the LEFT as finger swipes RIGHT (progress 0→1).
    transform: reducedMotion
      ? undefined
      : `translate3d(${(progress - 1) * 100}%, 0, 0)`,
    opacity: reducedMotion ? (progress > 0.5 ? 1 : 0) : 0.55 + progress * 0.45,
    transition: transitionOn,
  } as CSSProperties

  const metaBits = [
    categoryLabel,
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
        // Above mobile-safe-area-shield (z-160) + top chrome (z-100) so Haberi Oku
        // never leaves NaHaber brand bar stacked over Akışa Dön in Capacitor.
        'fixed inset-0 z-[170] flex justify-center',
        committed ? 'pointer-events-auto' : 'pointer-events-none'
      )}
      data-testid="feed-article-reader"
      data-reader-committed={committed ? '1' : '0'}
      data-reader-open={committed ? '1' : '0'}
      data-reader-progress={progress.toFixed(2)}
      data-reader-underlay="feed"
      role="dialog"
      aria-modal={committed}
      aria-labelledby={titleId}
      style={{ background: progress > 0.02 ? 'rgba(0,0,0,0.55)' : 'transparent' }}
    >
      <div
        className={cn(
          'feed-reader-article relative flex h-[100dvh] flex-col overflow-hidden md:my-0',
          FEED_READER_SURFACE_CLASS
        )}
        style={{
          ...FEED_V2_CHROME_CSS_VARS,
          ...styleVars,
          background: 'var(--reader-page-bg)',
          color: 'var(--reader-page-text)',
          boxShadow: progress > 0.12 ? `16px 0 32px var(--reader-fold-shadow)` : undefined,
          // While Reader owns the surface, keep vertical scroll but block Safari's
          // horizontal history swipe from co-owning the same LEFT-close gesture.
          ...(committed
            ? ({ touchAction: 'pan-y', overscrollBehaviorX: 'none' } as CSSProperties)
            : null),
        }}
        data-reader-touch-action={committed ? 'pan-y' : 'auto'}
        data-feed-surface="1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <ReaderReturnCoach
          active={committed && !coachClosing}
          suppressed={!committed || coachClosing}
          onAffordanceActivate={() => beginClose('gesture')}
        />

        <header
          className="flex shrink-0 items-center gap-1.5 border-b border-white/10 px-3 pb-2 pt-[max(0.85rem,calc(var(--reader-sat,var(--mobile-sat,env(safe-area-inset-top,0px)))+0.45rem))]"
          style={{ background: 'var(--reader-page-bg)' }}
          data-testid="feed-reader-header"
        >
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[color:var(--reader-page-text)] hover:bg-white/10"
            aria-label="Akışa dön"
            data-testid="feed-reader-close"
            onClick={() => beginClose('button')}
          >
            <ArrowLeft className="h-5 w-5 shrink-0" />
            <span className="text-[13px] font-semibold tracking-wide">Akışa Dön</span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium tracking-[0.04em] text-[color:var(--reader-page-muted)]">
              <span className="font-semibold uppercase tracking-[0.08em] text-[color:var(--reader-accent)]">
                {categoryLabel || 'Haber'}
              </span>
              <span className="text-white/25"> · </span>
              {publisherName}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-1.5 text-[color:var(--reader-page-text)] hover:bg-white/10"
            aria-label="Kaydet"
            onClick={onToggleSave}
          >
            <Bookmark
              className={cn('h-5 w-5', saved && 'fill-current text-[color:var(--reader-accent)]')}
            />
          </button>
          <button
            type="button"
            className="rounded-full p-1.5 text-[color:var(--reader-page-text)] hover:bg-white/10"
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
          className="feed-reader-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 sm:px-6"
          data-testid="feed-reader-scroll"
          style={{ background: 'var(--reader-page-bg)' }}
        >
          <div className="mx-auto w-full max-w-[var(--reader-prose-max)]">
          <p
            className="text-[12px] font-medium uppercase tracking-[0.08em] text-[color:var(--reader-page-muted)]"
            data-testid="feed-reader-meta"
          >
            {metaBits.map((bit, i) => (
              <span key={`${bit}-${i}`}>
                {i > 0 ? <span className="text-white/25"> · </span> : null}
                {i === 0 ? (
                  <span className="text-[color:var(--reader-accent)]">{bit}</span>
                ) : (
                  bit
                )}
              </span>
            ))}
          </p>
          <h1
            id={titleId}
            data-testid="feed-reader-headline"
            data-reader-upstream-cut={headlineUpstreamCut ? '1' : undefined}
            className="feed-reader-headline mt-3.5 break-words font-serif text-[clamp(1.875rem,8vw,2.625rem)] font-bold leading-[1.08] tracking-[-0.025em] text-[color:var(--reader-page-text)]"
            style={{ fontFamily: 'var(--font-serif-display, Georgia, serif)' }}
          >
            {headline}
          </h1>

          {summary ? (
            <p
              className="feed-reader-spot mt-6 break-words border-l-[3px] border-[color:var(--reader-accent)] pl-4 text-[1.25rem] font-semibold leading-[1.42] text-[color:var(--reader-prose-text)]"
              data-testid="feed-reader-spot"
              data-reader-upstream-cut={spotUpstreamCut ? '1' : undefined}
            >
              {summary}
            </p>
          ) : null}
          </div>

          {hero.state === 'LOADING' && hero.url ? (
            <div
              className="relative mx-auto mt-7 aspect-[16/9] w-full max-h-[min(62vh,28rem)] max-w-[var(--feed-reader-surface-max,44rem)] overflow-hidden rounded-[10px] bg-[color:var(--reader-page-elevated)]"
              data-testid="feed-reader-hero-loading"
              aria-busy="true"
            >
              <Image
                src={hero.url}
                alt=""
                fill
                className="object-cover opacity-0"
                sizes="(max-width: 704px) 100vw, 704px"
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
              className="mx-auto mt-7 w-full max-w-[var(--feed-reader-surface-max,44rem)]"
              data-testid="feed-reader-hero"
            >
              <div className="relative aspect-[16/9] max-h-[min(62vh,28rem)] w-full overflow-hidden rounded-[10px] bg-[color:var(--reader-page-elevated)]">
                <Image
                  src={hero.url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 704px) 100vw, 704px"
                  priority
                  unoptimized={readerHeroShouldBeUnoptimized(hero.url)}
                  onLoad={() => acceptHeroLoad(hero.url!, 'ok')}
                  onError={() => acceptHeroLoad(hero.url!, 'error')}
                />
              </div>
              {hero.caption ? (
                <figcaption className="mt-2 text-[12.5px] leading-[1.4] text-[color:var(--reader-page-muted)]">
                  {hero.caption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          {hero.state === 'FAILED_MEDIA' ? (
            <div
              className="mx-auto mt-7 max-w-[var(--reader-prose-max)] rounded-md border border-white/10 bg-[color:var(--reader-page-elevated)] px-3 py-2 text-xs text-[color:var(--reader-page-muted)]"
              data-testid="feed-reader-hero-failed"
            >
              Görsel yüklenemedi
            </div>
          ) : null}

          {/* NO_MEDIA: no hero container */}

          <div className="mx-auto w-full max-w-[var(--reader-prose-max)]">
          {fetchState === 'loading' && !detail?.bodyHtml ? (
            <div className="mt-8 space-y-2.5" aria-busy="true" data-testid="feed-reader-body-skeleton">
              <div className="h-2.5 w-full animate-pulse rounded bg-white/10" />
              <div className="h-2.5 w-[92%] animate-pulse rounded bg-white/10" />
              <div className="h-2.5 w-[85%] animate-pulse rounded bg-white/10" />
              <div className="h-2.5 w-[88%] animate-pulse rounded bg-white/10" />
            </div>
          ) : null}

          {fetchState === 'error' ? (
            <div className="mt-8 rounded-md border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-100">
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
              className="feed-reader-body reader-body mt-8"
              data-testid="feed-reader-body"
              dangerouslySetInnerHTML={{ __html: bodyHtmlRendered }}
            />
          ) : fetchState === 'loading' && committed ? (
            <div className="mt-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[color:var(--reader-page-muted)]" />
            </div>
          ) : null}

          <aside
            className="mt-10 rounded-lg border border-white/10 bg-[color:var(--reader-page-elevated)] p-4 text-sm"
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
          <div
            data-testid="feed-reader-footer-clearance"
            aria-hidden
            className="w-full shrink-0"
            style={{ height: 'var(--reader-footer-clearance)' }}
          />
        </div>

        <footer
          className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          style={{ background: 'var(--reader-page-bg)' }}
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
    velocityX: Math.max(0, opts.velocityX),
  })
  return { open, progress }
}
